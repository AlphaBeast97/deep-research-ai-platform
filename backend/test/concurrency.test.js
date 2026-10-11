import assert from 'node:assert/strict'
import test from 'node:test'
import { mapConcurrent } from '../src/util/concurrency.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('results stay in input order regardless of completion order', async () => {
  const out = await mapConcurrent([30, 5, 15], 3, async (ms) => {
    await sleep(ms)
    return ms
  })
  assert.deepEqual(out, [30, 5, 15])
})

test('no more than `limit` jobs run at once', async () => {
  let inFlight = 0
  let peak = 0

  await mapConcurrent([0, 1, 2, 3, 4, 5, 6], 2, async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await sleep(5)
    inFlight--
  })

  assert.equal(peak, 2)
})

test('a failure stops new work and rejects with that error', async () => {
  let started = 0

  await assert.rejects(
    mapConcurrent([0, 1, 2, 3, 4, 5, 6], 2, async (i) => {
      started++
      if (i === 0) throw new Error('boom')
      await sleep(20)
    }),
    /boom/,
  )

  // The pool stops claiming items once it has failed; it does not run all seven.
  assert.ok(started <= 3, `expected at most 3 jobs to start, got ${started}`)
})

test('a limit below the item count still runs everything', async () => {
  const out = await mapConcurrent([1, 2, 3, 4, 5], 1, async (n) => n * 2)
  assert.deepEqual(out, [2, 4, 6, 8, 10])
})

test('an empty list resolves to an empty result', async () => {
  assert.deepEqual(await mapConcurrent([], 3, async (n) => n), [])
})
