import OpenAI from 'openai'
import config from './config.js'

// Local servers (Ollama, LM Studio, vLLM) don't require a key, but the SDK
// rejects an empty string — so send a placeholder when none is set. 
//
// `timeout` / `maxRetries` are set explicitly because the SDK defaults are 10
// minutes and 2 retries: a provider that accepts a request and then sends
// nothing would hold the run — and its SSE connection — for up to half an hour
// without ever reporting a failure.
const client = new OpenAI({
  apiKey: config.llm.apiKey || 'not-needed',
  // Any OpenAI-compatible provider works: Groq, OpenRouter, Together, etc.
  ...(config.llm.baseUrl ? { baseURL: config.llm.baseUrl } : {}),
  timeout: config.llm.timeoutMs,
  maxRetries: config.llm.maxRetries,
})

/** Raised when the caller stopped the run; the pipeline treats it as "not an error". */
export class AbortedError extends Error {
  constructor(message = 'The run was stopped.') {
    super(message)
    this.name = 'AbortError'
  }
}

/** Whether a failure is a stop rather than a break. */
export const isAbortError = (err) => err?.name === 'AbortError'

/** Throw before starting work the caller has already abandoned. */
export function throwIfAborted(signal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new AbortedError()
}

/**
 * Combine any number of optional abort signals into one.
 *
 * A model call needs to abort for either of two reasons — the user stopped the
 * run, or our own watchdog decided the provider had stalled — so both signals
 * have to reach the SDK as a single `signal`.
 */
export function combineSignals(...signals) {
  const active = signals.filter(Boolean)
  if (active.length === 0) return undefined
  if (active.length === 1) return active[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active)

  // Fallback for runtimes without AbortSignal.any.
  const controller = new AbortController()
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

const seconds = (ms) => Math.round(ms / 1000)

// Every message below names the model that actually made the call. `config.llm.model`
// is the small tier, so naming it here would send a user chasing the wrong
// model name when the planner, writer or critic is the one that timed out.
const timeoutMessage = (model) =>
  `The model did not respond within ${seconds(config.llm.timeoutMs)}s ` +
  `(${config.llm.baseUrl || 'api.openai.com'}, model "${model || config.llm.model}"). ` +
  'Check that the model name exists at your provider, or raise LLM_TIMEOUT_MS.'

const emptyMessage = (model) =>
  `The model "${model || config.llm.model}" returned an empty response. ` +
  'Check LLM_MODEL / LLM_MODEL_SMART against your provider\'s catalogue.'

/** No token arrived before the model had started writing at all. */
const firstTokenMessage = (model) =>
  `The model accepted the request but produced no output for ${seconds(config.llm.timeoutMs)}s ` +
  `(model "${model || config.llm.smartModel}" at ${config.llm.baseUrl || 'api.openai.com'}). ` +
  'Raise LLM_TIMEOUT_MS, or use a model that starts writing sooner.'

/**
 * The answer stopped mid-flight. Deliberately says the *answer* was cut off
 * rather than the run: a stalled revision stream is caught in `orchestrator.js`
 * and degraded to the draft, so the run itself survives it.
 */
const stalledMessage = (model) =>
  `The model stopped sending output for ${seconds(config.llm.streamIdleTimeoutMs)}s and the answer was cut off. ` +
  `Model "${model || config.llm.smartModel}" may be unavailable at ${config.llm.baseUrl || 'api.openai.com'} — ` +
  'try another LLM_MODEL_SMART, or raise LLM_STREAM_IDLE_TIMEOUT_MS.'

/**
 * The provider cut the answer off at its output ceiling (`finish_reason:
 * "length"`). Named separately from a stall: the fix is a higher token limit or
 * a shorter report, not a different model or endpoint.
 */
const truncatedMessage = (model) =>
  `The model "${model || config.llm.smartModel}" hit its output limit and the answer was cut off. ` +
  `Raise the provider's max output tokens for this model, or ask for a shorter report.`

/**
 * Turn an SDK failure into something a user can act on. Aborts caused by the
 * caller are re-raised as `AbortedError` so the pipeline can tell "the user
 * stopped this" apart from "this broke".
 *
 * When the stop switch carries a reason (the run deadline sets one) that error
 * is returned as-is: it is the only explanation the user gets, and replacing it
 * with a generic "the run was stopped" hides why.
 */
export function explainError(err, signal, model) {
  if (signal?.aborted) {
    if (signal.reason instanceof Error) return signal.reason
    return err instanceof AbortedError ? err : new AbortedError()
  }
  if (err?.name === 'AbortError') return err
  if (err?.name === 'APIConnectionTimeoutError' || /timed out/i.test(err?.message || '')) {
    return new Error(timeoutMessage(model))
  }
  return err
}

/** Sum the token usage of two attempts, so a retry is still attributable. */
function mergeUsage(a, b) {
  if (!a) return b
  if (!b) return a
  return {
    ...a,
    prompt_tokens: (a.prompt_tokens || 0) + (b.prompt_tokens || 0),
    completion_tokens: (a.completion_tokens || 0) + (b.completion_tokens || 0),
    total_tokens: (a.total_tokens || 0) + (b.total_tokens || 0),
  }
}

/** The strict second turn: no prose, no fence, just the object. */
const repairTurn = (user) =>
  `${user}\n\nIMPORTANT: your previous reply was not valid JSON. Respond with ONLY a\nsingle valid JSON object — no prose, no explanation, no markdown, no code fence.`

/**
 * One request, parsed. Returns the parsed object, or a flag describing why it
 * could not be used (an unusable answer is a reason to retry, not to fail).
 */
async function requestJSON({ system, user, model, temperature, signal }) {
  throwIfAborted(signal)

  let completion
  try {
    completion = await client.chat.completions.create(
      {
        model: model || config.llm.model,
        temperature,
        // Not every OpenAI-compatible server implements json_object; when it's
        // disabled the prompt still asks for JSON and we salvage it below.
        ...(config.llm.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { signal, timeout: config.llm.timeoutMs, maxRetries: config.llm.maxRetries },
    )
  } catch (err) {
    throw explainError(err, signal, model)
  }

  const usage = completion.usage
  const text = completion.choices?.[0]?.message?.content || ''
  if (!text.trim()) return { kind: 'empty', usage }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    // Occasionally the model wraps JSON in prose — salvage the first object.
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { kind: 'invalid', usage }
    try {
      data = JSON.parse(match[0])
    } catch {
      return { kind: 'invalid', usage }
    }
  }

  // Every caller destructures object fields, so a bare array/string/number would
  // surface as a confusing "cannot read property of undefined" much later.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'invalid', usage }
  }

  return { kind: 'ok', data, usage }
}

/**
 * Ask the model for a JSON object and parse it. Uses OpenAI's JSON response
 * format so we never have to wrestle markdown code fences.
 *
 * A prose answer, a truncated object, or an empty reply gets exactly one repair
 * attempt before the call fails. These are rare, model-specific stutters — one
 * of them killing a run that has already spent minutes on searches and
 * extractions is a much worse outcome than one extra API call.
 */
export async function chatJSON({ system, user, model, temperature = 0.2, signal }) {
  const first = await requestJSON({ system, user, model, temperature, signal })
  if (first.kind === 'ok') return { data: first.data, usage: first.usage }

  // Worth a line in the log: it is invisible to the user, and a provider that
  // does this often is worth replacing.
  console.warn(
    `[llm] ${model || config.llm.model} returned ${first.kind === 'empty' ? 'no content' : 'unparseable JSON'}; asking once more.`,
  )

  const second = await requestJSON({
    system,
    user: repairTurn(user),
    model,
    temperature: first.kind === 'empty' ? 0 : temperature,
    signal,
  })
  if (second.kind === 'ok') return { data: second.data, usage: mergeUsage(first.usage, second.usage) }

  if (second.kind === 'empty') throw new Error(emptyMessage(model || config.llm.model))
  throw new Error(
    'The model did not return valid JSON, even after being asked again to reply with only JSON.',
  )
}

/**
 * Stream a text completion token-by-token. `onToken` is invoked for each delta
 * so the caller can forward it over SSE immediately.
 *
 * The SDK's request timeout is cleared as soon as the response *headers* land,
 * so it cannot catch a stream that opens and then goes quiet — the watchdog here
 * can. It measures two different waits with two different budgets:
 *
 *   · **Time to the first token** — queueing plus prompt processing. On a
 *     revision the prompt carries the whole draft, so this wait is legitimately
 *     long, and it is the same kind of wait as the request itself: it gets
 *     `LLM_TIMEOUT_MS`. (Before the headers the SDK's own timeout covers it,
 *     which is why the watchdog is armed only once `create` resolves.)
 *   · **The gap between tokens** — normally milliseconds, so a long silence
 *     means a model thinking hard or a stream that has died:
 *     `LLM_STREAM_IDLE_TIMEOUT_MS`.
 *
 * Any frame re-arms the watchdog, because any frame proves the provider is still
 * there; only real output (content, or a reasoning delta) switches it from the
 * first-token budget to the inter-token one, so a slow first token is never
 * judged by the tighter number. A provider that keeps sending empty frames is
 * alive by definition, and `RUN_TIMEOUT_MS` is the backstop for a run that then
 * never finishes.
 *
 * Retries cannot rescue any of this: a stream that dies after the headers is
 * already past the SDK's retry loop.
 *
 * `onUsage` receives the provider's token accounting once, after the stream
 * ends. The frame is optional — a provider may not send it, and one that
 * rejects `stream_options` is retried without it — so a missing frame means the
 * cost of this call is unknown, never zero.
 */
export async function chatStream({
  system,
  user,
  model,
  temperature = 0.4,
  onToken,
  onUsage,
  signal,
}) {
  const idle = new AbortController()
  const idleMs = config.llm.streamIdleTimeoutMs
  const firstTokenMs = config.llm.timeoutMs
  let budgetMs = firstTokenMs
  let writing = false
  let timer = null
  let stalled = false
  let usage = null
  let finishReason = null

  const armWatchdog = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      stalled = true
      idle.abort()
    }, budgetMs)
  }

  const stallError = () => new Error(writing ? stalledMessage(model) : firstTokenMessage(model))

  try {
    throwIfAborted(signal)

    const request = (withUsageFrame) =>
      client.chat.completions.create(
        {
          model: model || config.llm.smartModel,
          temperature,
          stream: true,
          // Ask for the final frame that carries token usage. Not every
          // OpenAI-compatible server implements it, so a 400 is retried without
          // it below: the report must not depend on a bookkeeping field.
          ...(withUsageFrame ? { stream_options: { include_usage: true } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        {
          signal: combineSignals(signal, idle.signal),
          timeout: config.llm.timeoutMs,
          maxRetries: config.llm.maxRetries,
        },
      )

    let stream
    try {
      stream = await request(true)
    } catch (err) {
      // A 400 is how OpenAI-compatible servers reject an unknown parameter.
      // One retry without the usage frame separates "this server does not know
      // stream_options" from a genuinely bad request, which fails again here
      // and is reported as the caller's error. No tokens are spent on a 400.
      if (signal?.aborted || err?.status !== 400) throw err
      console.warn(
        `[llm] ${model || config.llm.smartModel} rejected stream_options; retrying without token accounting.`,
      )
      stream = await request(false)
    }

    // Headers are in. Whatever waits from here — the first token, or a silence
    // in the middle of the report — the SDK is no longer watching for it.
    armWatchdog()

    let text = ''
    for await (const chunk of stream) {
      // Usage arrives on a final frame whose `choices` is empty. Some providers
      // repeat a running total on every frame, so keep the last value and emit
      // it once after the loop rather than summing frames that may overlap.
      if (chunk.usage) usage = chunk.usage
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason

      const delta = chunk.choices?.[0]?.delta
      // `reasoning_content` / `reasoning` are what several OpenAI-compatible
      // providers expose a thinking model's output as. Either counts as the
      // model having started: switching budgets on a role-only frame would put
      // the first-token wait back on the inter-token clock.
      if (!writing && (delta?.content || delta?.reasoning_content || delta?.reasoning)) {
        writing = true
        budgetMs = idleMs
      }
      armWatchdog()
      if (delta?.content) {
        text += delta.content
        if (onToken) onToken(delta.content)
      }
    }

    // The tokens were spent whether or not the answer below is usable, so the
    // cost is reported before any of the failure checks — a cut-off draft still
    // consumed the whole prompt and whatever it wrote.
    if (onUsage && usage) onUsage(usage)

    // Aborting the response does **not** reliably surface as an error: the body
    // is closed and the SDK's iterator simply completes. Without this, a stall
    // that killed the tail of an answer would fall through and be returned as a
    // finished one — a truncated report, persisted as complete. So the stall is
    // re-asserted here, before the empty-answer check (an answer cut off before
    // the first token has no text and would otherwise be reported as "empty",
    // which names the wrong problem).
    if (stalled) throw stallError()

    // An answer cut off at the provider's ceiling is not a finished report, and
    // nothing downstream can tell the difference: a mid-section cut keeps its
    // headings, its citations and most of its figures, so every structural
    // guard passes. A reasoning model that spent its whole budget thinking is
    // still reported as empty — that is a model-selection problem, not a limit
    // that can be raised.
    if (!text.trim()) throw new Error(emptyMessage(model || config.llm.smartModel))

    if (finishReason === 'length') throw new Error(truncatedMessage(model))

    return text
  } catch (err) {
    if (stalled) throw stallError()
    throw explainError(err, signal, model)
  } finally {
    clearTimeout(timer)
  }
}
