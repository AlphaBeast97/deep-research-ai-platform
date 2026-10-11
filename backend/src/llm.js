import OpenAI from 'openai'
import config from './config.js'

// Local servers (Ollama, LM Studio, vLLM) don't require a key, but the SDK
// rejects an empty string — so send a placeholder when none is set. Presence of
// credentials is validated at startup (see index.js), so there is no mock
// fallback to worry about here.
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

const timeoutMessage = () =>
  `The model did not respond within ${seconds(config.llm.timeoutMs)}s ` +
  `(${config.llm.baseUrl || 'api.openai.com'}, model "${config.llm.model}"). ` +
  'Check that the model name exists at your provider, or raise LLM_TIMEOUT_MS.'

const emptyMessage = (model) =>
  `The model "${model || config.llm.model}" returned an empty response. ` +
  'Check LLM_MODEL / LLM_MODEL_SMART against your provider\'s catalogue.'

/**
 * Turn an SDK failure into something a user can act on. Aborts caused by the
 * caller are re-raised as `AbortedError` so the pipeline can tell "the user
 * stopped this" apart from "this broke".
 *
 * When the stop switch carries a reason (the run deadline sets one) that error
 * is returned as-is: it is the only explanation the user gets, and replacing it
 * with a generic "the run was stopped" hides why.
 */
export function explainError(err, signal) {
  if (signal?.aborted) {
    if (signal.reason instanceof Error) return signal.reason
    return err instanceof AbortedError ? err : new AbortedError()
  }
  if (err?.name === 'AbortError') return err
  if (err?.name === 'APIConnectionTimeoutError' || /timed out/i.test(err?.message || '')) {
    return new Error(timeoutMessage())
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
    throw explainError(err, signal)
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
 * so it cannot catch a stream that opens and then goes quiet. The watchdog here
 * aborts when no token has arrived for `LLM_STREAM_IDLE_TIMEOUT_MS`; every token
 * re-arms it, so a slow-but-progressing report is never cut off.
 */
export async function chatStream({ system, user, model, temperature = 0.4, onToken, signal }) {
  const idle = new AbortController()
  const idleMs = config.llm.streamIdleTimeoutMs
  let timer = null
  let stalled = false

  const armWatchdog = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      stalled = true
      idle.abort()
    }, idleMs)
  }

  armWatchdog()
  try {
    throwIfAborted(signal)

    const stream = await client.chat.completions.create(
      {
        model: model || config.llm.smartModel,
        temperature,
        stream: true,
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

    let text = ''
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        armWatchdog()
        text += delta
        if (onToken) onToken(delta)
      }
    }

    if (!text.trim()) throw new Error(emptyMessage(model || config.llm.smartModel))
    return text
  } catch (err) {
    if (stalled) {
      throw new Error(
        `The model stopped sending output for ${seconds(idleMs)}s and the run was cut off. ` +
          `Model "${model || config.llm.smartModel}" may be unavailable at ${config.llm.baseUrl || 'api.openai.com'} — ` +
          'try another LLM_MODEL_SMART, or raise LLM_STREAM_IDLE_TIMEOUT_MS.',
      )
    }
    throw explainError(err, signal)
  } finally {
    clearTimeout(timer)
  }
}
