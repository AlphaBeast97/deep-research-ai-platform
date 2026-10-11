import assert from 'node:assert/strict'
import test from 'node:test'
import { needsFollowUp, parseFindings } from '../src/agents/researcher.js'

test('findings keep only the citations that resolve to the given sources', () => {
  const { findings, dropped } = parseFindings(
    [
      { point: 'A supported fact', cites: [1, 9], confidence: 'high' },
      { point: 'Cites only an out-of-range number', cites: [9] },
      { point: 'No citations at all' },
    ],
    [1, 2],
  )

  assert.deepEqual(findings, [{ point: 'A supported fact', cites: [1], confidence: 'high' }])
  assert.equal(dropped, 2)
})

test('cites arriving as one comma-separated string are parsed', () => {
  const { findings } = parseFindings([{ point: 'p', cites: '1, 2' }], [1, 2])
  assert.deepEqual(findings[0].cites, [1, 2])
})

test('duplicate citations collapse and confidence falls back to medium', () => {
  const { findings } = parseFindings([{ point: 'p', cites: [2, 2, '2'], confidence: 'CERTAIN' }], [2])
  assert.deepEqual(findings[0].cites, [2])
  assert.equal(findings[0].confidence, 'medium')
})

test('an empty or malformed findings array yields nothing', () => {
  assert.deepEqual(parseFindings(undefined, [1]), { findings: [], dropped: 0 })
  assert.deepEqual(parseFindings('nope', [1]), { findings: [], dropped: 0 })
})

test('a finding without a point is ignored, not counted as dropped', () => {
  const { findings, dropped } = parseFindings([{ cites: [1] }], [1])
  assert.deepEqual(findings, [])
  assert.equal(dropped, 0)
})

test('a sub-question with no findings always gets another round', () => {
  assert.equal(needsFollowUp({ findings: [], coverage: 95 }, 60), true)
  assert.equal(needsFollowUp(null, 60), true)
})

test('coverage below the floor triggers a round; at or above it does not', () => {
  const findings = [{ point: 'p', cites: [1], confidence: 'high' }]
  assert.equal(needsFollowUp({ findings, coverage: 10 }, 60), true)
  assert.equal(needsFollowUp({ findings, coverage: 60 }, 60), false)
  assert.equal(needsFollowUp({ findings, coverage: null }, 60), false)
})
