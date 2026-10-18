import assert from 'node:assert/strict'
import test from 'node:test'
import { recordFor } from '../src/agents/orchestrator.js'

const plan = {
  title: 'Capacity review',
  scope: 'One market',
  subQuestions: [{ question: 'What changed?', theme: 'Market' }],
}

const progress = (over = {}) => ({
  runId: 'run-1',
  ownerId: 'user-1',
  query: 'capacity',
  typeId: 'analyst',
  startedAt: Date.now(),
  plan,
  sources: [{ index: 1, url: 'https://example.com', title: 'Source' }],
  steps: [],
  phases: [],
  usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  ...over,
})

test('a run stopped during the draft keeps the draft, not an empty report', () => {
  const record = recordFor(progress({ draft: '## Partial\n\nHalf a report [1].' }), 'stopped', {
    error: 'The client disconnected.',
  })

  assert.equal(record.status, 'stopped')
  assert.equal(record.report, '## Partial\n\nHalf a report [1].')
  assert.equal(record.revised, false)
  assert.equal(record.error, 'The client disconnected.')
  assert.equal(record.title, 'Capacity review')
  assert.equal(record.subQuestions.length, 1)
  assert.equal(record.searchRounds, 0)
})

test('a rejected revision does not replace the draft and is recorded', () => {
  const record = recordFor(
    progress({
      draft: '# Draft\n\nBody [1].',
      report: '# Draft\n\nBody [1].',
      revisionRejected: 'the revision dropped every citation',
    }),
    'complete',
  )

  assert.equal(record.report, '# Draft\n\nBody [1].')
  assert.equal(record.revisionRejected, 'the revision dropped every citation')
  assert.equal(record.revised, false)
})

test('an accepted revision is what gets stored', () => {
  const record = recordFor(
    progress({ draft: '# Draft [1].', report: '# Final\n\nCorrected [1].', revised: true }),
    'complete',
  )

  assert.equal(record.report, '# Final\n\nCorrected [1].')
  assert.equal(record.revised, true)
  assert.equal(record.revisionRejected, null)
})

test('a run that never reached a plan still yields a readable shape', () => {
  const record = recordFor({ runId: 'run-2', ownerId: 'u', query: 'q', typeId: 'brief' }, 'failed', {
    error: 'boom',
  })

  assert.equal(record.report, '')
  assert.equal(record.title, 'q')
  assert.deepEqual(record.sources, [])
  assert.deepEqual(record.research, [])
  assert.deepEqual(record.usage, { promptTokens: 0, completionTokens: 0, totalTokens: 0 })
})
