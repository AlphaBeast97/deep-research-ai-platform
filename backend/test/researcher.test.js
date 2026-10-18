import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeExtractions, needsFollowUp, parseFindings } from '../src/agents/researcher.js'

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

const extraction = (over = {}) => ({
  question: 'q',
  intent: '',
  summary: 's',
  coverage: 40,
  findings: [],
  droppedFindings: 0,
  gaps: [],
  ...over,
})

const finding = (point, cites, confidence = 'medium') => ({ point, cites, confidence })

test('a later round that found nothing does not erase earlier findings', () => {
  const first = extraction({ findings: [finding('Capacity fell 12% [1]', [1])], coverage: 70 })
  const second = extraction({
    summary: 'No sources were found for this sub-question.',
    coverage: 0,
    gaps: ['Search returned no usable results.'],
  })

  const merged = mergeExtractions(first, second)
  assert.equal(merged.findings.length, 1)
  assert.equal(merged.summary, 's')
  assert.equal(merged.coverage, 70)
})

test('findings from both rounds are kept, with repeated claims merged', () => {
  const first = extraction({ findings: [finding('Capacity fell 12% [1]', [1], 'low')] })
  const second = extraction({
    findings: [
      finding('Capacity fell 12% [1]', [2], 'high'),
      finding('Three plants closed [3]', [3], 'high'),
    ],
  })

  const merged = mergeExtractions(first, second)
  assert.deepEqual(
    merged.findings.map((f) => f.point),
    ['Capacity fell 12% [1]', 'Three plants closed [3]'],
  )
  assert.deepEqual(merged.findings[0].cites, [1, 2])
  assert.equal(merged.findings[0].confidence, 'high')
})

test('coverage never regresses and gaps from both rounds stay open', () => {
  const merged = mergeExtractions(
    extraction({ coverage: 55, gaps: ['No pricing data.'] }),
    extraction({ coverage: 30, gaps: ['No headcount data.', 'No pricing data.'] }),
  )
  assert.equal(merged.coverage, 55)
  assert.deepEqual(merged.gaps, ['No pricing data.', 'No headcount data.'])
})

test('merging with nothing on one side is a no-op', () => {
  const only = extraction({ findings: [finding('p', [1])] })
  assert.equal(mergeExtractions(null, only), only)
  assert.equal(mergeExtractions(only, null), only)
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
