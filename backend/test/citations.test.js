import assert from 'node:assert/strict'
import test from 'node:test'
import {
  auditCitations,
  citedIndexes,
  sanitizeCitations,
} from '../src/agents/citations.js'

const sources = [
  { index: 1, url: 'https://a.test' },
  { index: 2, url: 'https://b.test' },
  { index: 3, url: 'https://c.test' },
]

test('audit counts references, distinct cited sources, and uncited leftovers', () => {
  const audit = auditCitations('One [1]. Two [1][2]. Three [7].', sources)
  assert.equal(audit.references, 4)
  assert.equal(audit.citedSourceCount, 2)
  assert.equal(audit.sourceCount, 3)
  assert.equal(audit.coverage, 67)
  assert.deepEqual(audit.invalid, [7])
  assert.deepEqual(audit.uncited, [3])
})

test('a markdown link whose text is a number is not a citation', () => {
  assert.equal(auditCitations('[1](https://a.test) is a link.', sources).references, 0)
})

test('citedIndexes reports every number the report uses', () => {
  assert.deepEqual([...citedIndexes('a [2] b [1, 3] c [3]')].sort(), [1, 2, 3])
})

test('sanitize removes citations with no matching source', () => {
  assert.equal(sanitizeCitations('Claim [1]. Broken [9].', new Set([1])), 'Claim [1]. Broken.')
})

test('sanitize keeps a single space when a removed marker sat between two words', () => {
  assert.equal(sanitizeCitations('in 2024 [9] and later', new Set([1])), 'in 2024 and later')
})

test('sanitize trims a group down to the numbers that resolve', () => {
  assert.equal(sanitizeCitations('Both [1, 9] hold.', new Set([1])), 'Both [1] hold.')
})

// Regression: the old implementation collapsed every run of two spaces in the
// report, which silently flattened nested Markdown lists.
test('sanitize leaves markdown list indentation exactly as written', () => {
  const markdown = '- top\n  - nested\n  - nested two\n1. one\n   continuation\n'
  assert.equal(sanitizeCitations(markdown, new Set([1])), markdown)
})

test('sanitize never rewrites a fenced block', () => {
  const markdown = '```mermaid\nflowchart TD\n  A --> B\n```\nA claim [9].'
  assert.equal(sanitizeCitations(markdown, new Set()), '```mermaid\nflowchart TD\n  A --> B\n```\nA claim.')
})

test('sanitize is a no-op when every citation resolves', () => {
  const markdown = 'A claim [1] and another [2].'
  assert.equal(sanitizeCitations(markdown, new Set([1, 2])), markdown)
})
