import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AbortedError,
  combineSignals,
  explainError,
  isAbortError,
  throwIfAborted,
} from '../src/llm.js'

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
