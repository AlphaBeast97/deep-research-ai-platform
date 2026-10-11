import assert from 'node:assert/strict'
import test from 'node:test'
import { hasMaterialIssues, normalise } from '../src/agents/critic.js'

test('a high-severity issue outranks a lenient self-assessment', () => {
  const critique = normalise({
    verdict: 'solid',
    issues: [{ severity: 'high', type: 'miscitation', problem: 'Wrong source' }],
  })
  assert.equal(critique.verdict, 'needs-revision')
  assert.equal(hasMaterialIssues(critique), true)
})

test('unknown severities and types fall back instead of leaking through', () => {
  const critique = normalise({ issues: [{ severity: 'ENORMOUS', problem: 'Something' }] })
  assert.equal(critique.issues[0].severity, 'medium')
  assert.equal(critique.issues[0].type, 'other')
  assert.equal(critique.verdict, 'minor-issues')
})

test('issues and citation problems without a problem statement are discarded', () => {
  const critique = normalise({
    issues: [{ severity: 'high', claim: 'no problem field' }],
    citationProblems: [{ citation: '[3]' }],
  })
  assert.deepEqual(critique.issues, [])
  assert.deepEqual(critique.citationProblems, [])
})

test('an unparseable verdict falls back to minor-issues', () => {
  assert.equal(normalise({ verdict: 'catastrophic' }).verdict, 'minor-issues')
  assert.equal(normalise({}).verdict, 'minor-issues')
})

test('a citation problem counts as material even with no high-severity issue', () => {
  const critique = normalise({ citationProblems: [{ citation: '[3]', problem: 'Does not say this' }] })
  assert.equal(critique.verdict, 'minor-issues')
  assert.equal(hasMaterialIssues(critique), true)
})

test('a critique with nothing wrong is not material', () => {
  const critique = normalise({ verdict: 'solid', issues: [], recommendations: [] })
  assert.equal(hasMaterialIssues(critique), false)
  assert.equal(hasMaterialIssues(null), false)
})
