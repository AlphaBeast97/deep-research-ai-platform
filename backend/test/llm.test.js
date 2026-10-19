import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { createServer } from 'node:http'

/**
 * The streamed-call tests below need `chatStream` to talk to *this* process, so
 * the base URL must be set before `config.js` is first imported — hence the
 * dynamic import. A static one would be hoisted above the assignment and the
 * SDK would call the real provider.
 */

/** Frames the next request is answered with. */
let frames = []
/** Bodies the server received, so a retry can be told from a first attempt. */
let requests = []
/** Answer 400 to any request that asks for stream_options. */
let rejectStreamOptions = false

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    requests.push(parsed)

    if (rejectStreamOptions && parsed.stream_options) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: { message: 'Unsupported parameter: stream_options', type: 'invalid_request_error' },
        }),
      )
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const frame of frames) res.write(`data: ${JSON.stringify(frame)}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
process.env.LLM_API_KEY = 'test-key'
process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`

const { AbortedError, chatStream, combineSignals, explainError, isAbortError, throwIfAborted } =
  await import('../src/llm.js')

after(() => {
  server.closeAllConnections?.()
  server.close()
})

test('no signals means no signal', () => {
  assert.equal(combineSignals(undefined, null), undefined)
})

test('a single signal is passed through untouched', () => {
  const controller = new AbortController()
  assert.equal(combineSignals(controller.signal), controller.signal)
})

test('the combined signal aborts when any input aborts', () => {
  const stop = new AbortController()
  const watchdog = new AbortController()
  const combined = combineSignals(stop.signal, watchdog.signal)

  assert.equal(combined.aborted, false)
  watchdog.abort(new Error('stalled'))
  assert.equal(combined.aborted, true)
  assert.equal(combined.reason.message, 'stalled')
})

test('an already-aborted input produces an aborted combination', () => {
  const stop = new AbortController()
  stop.abort()
  assert.equal(combineSignals(stop.signal, new AbortController().signal).aborted, true)
})

test('throwIfAborted rethrows the abort reason, not a generic error', () => {
  const controller = new AbortController()
  controller.abort(new Error('The run exceeded 15 minutes and was stopped.'))
  assert.throws(() => throwIfAborted(controller.signal), /exceeded 15 minutes/)
})

test('an abort with no reason still reads as a stop, and a live signal is a no-op', () => {
  const bare = new AbortController()
  bare.abort()

  // Node supplies a DOMException named AbortError as the default reason; what
  // matters to the pipeline is that it is recognisable as a stop.
  assert.throws(() => throwIfAborted(bare.signal), (err) => isAbortError(err))
  assert.doesNotThrow(() => throwIfAborted(new AbortController().signal))
  assert.doesNotThrow(() => throwIfAborted(undefined))
})

test('a stop reason set by the run deadline survives error translation', () => {
  const controller = new AbortController()
  const reason = new AbortedError('The run exceeded 15 minutes and was stopped.')
  controller.abort(reason)

  const translated = explainError(new Error('Connection error.'), controller.signal)
  // The user is told why the run ended, not just that it did.
  assert.equal(translated, reason)
  assert.equal(isAbortError(translated), true)
})

test('an abort with no reason becomes a generic stop; a provider timeout is named', () => {
  const bare = new AbortController()
  bare.abort()

  assert.equal(isAbortError(explainError(new Error('x'), bare.signal)), true)

  const timeout = Object.assign(new Error('Request timed out.'), {
    name: 'APIConnectionTimeoutError',
  })
  assert.match(explainError(timeout, new AbortController().signal).message, /LLM_TIMEOUT_MS/)
})

test('only AbortError-shaped failures count as a stop', () => {
  assert.equal(isAbortError(new AbortedError()), true)
  assert.equal(isAbortError(Object.assign(new Error('nope'), { name: 'AbortError' })), true)
  assert.equal(isAbortError(new Error('boom')), false)
  assert.equal(isAbortError(undefined), false)
})

// ── the streamed call, against a local SSE server ────────────────────────

test('a streamed answer reports its usage once, from the last frame', async () => {
  requests = []
  frames = [
    { choices: [{ delta: { content: 'Hello' } }] },
    // Providers send usage on a frame with no choices...
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    // ...and some repeat a running total on later frames, so the frames must
    // not be summed — only the last one is the call's usage.
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 } },
  ]

  const seen = []
  const text = await chatStream({
    system: 'test',
    user: 'test',
    model: 'test-model',
    onUsage: (u) => seen.push(u),
  })

  assert.equal(text, 'Hello')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].total_tokens, 16)
  assert.equal(requests[0].stream_options.include_usage, true)
})

test('an answer cut off at the output limit fails instead of looking finished', async () => {
  requests = []
  frames = [
    { choices: [{ delta: { content: '## Findings\n\nThe partial section' } }] },
    { choices: [{ delta: {}, finish_reason: 'length' }] },
  ]

  // The text has a heading and would pass every downstream structural check,
  // which is exactly why the transport has to reject it.
  await assert.rejects(
    () => chatStream({ system: 'test', user: 'test', model: 'test-model' }),
    /hit its output limit/,
  )
})

test('a provider that rejects stream_options is retried without it', async () => {
  requests = []
  rejectStreamOptions = true
  frames = [{ choices: [{ delta: { content: 'ok' } }] }]

  try {
    const text = await chatStream({ system: 'test', user: 'test', model: 'test-model' })
    assert.equal(text, 'ok')
  } finally {
    rejectStreamOptions = false
  }

  assert.equal(requests.length, 2)
  assert.equal('stream_options' in requests[0], true)
  assert.equal('stream_options' in requests[1], false)
})
