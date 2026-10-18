import assert from 'node:assert/strict'
import test from 'node:test'
import { revisionRejection } from '../src/agents/writer.js'

// Seven distinct figures across two sections, all cited.
const DRAFT = `# Capacity review

## Findings

The plant cut capacity by 12% in 2025 [1], while revenue reached 4.2 billion dollars [2].
Three plants closed [3] and output was flat through 2024 [1]. Headcount fell by 45 people [2],
and the remaining site ran at 78% utilisation [3].

## Outlook

Demand is expected to rise, according to the operator [1], although the regulator has not
published 2026 guidance [3].
`

test('an empty revision is rejected', () => {
  assert.match(revisionRejection(DRAFT, ''), /empty/)
  assert.match(revisionRejection(DRAFT, '   \n '), /empty/)
})

test('a revision that drops every citation is rejected', () => {
  const candidate = '# Capacity review\n\n## Findings\n\nCapacity fell 12% in 2025.\n'
  assert.match(revisionRejection(DRAFT, candidate), /citation/)
})

test('a revision with no section headings is rejected as a fragment', () => {
  const candidate = 'Capacity fell 12% in 2025 [1], revenue reached 4.2 billion [2], 2024 was flat [1].'
  assert.match(revisionRejection(DRAFT, candidate), /headings/)
})

test('a much shorter revision that keeps the facts is accepted', () => {
  // This is the case the old `wordCount >= 120` gate got wrong in both
  // directions: the revision is well under half the draft's length, but every
  // figure and citation survives.
  const candidate = `# Capacity review

## Findings

Capacity fell 12% in 2025 [1]; revenue reached 4.2 billion [2]. Three plants closed [3],
2024 output was flat [1], headcount fell 45 [2] and utilisation was 78% [3].

## Outlook

Demand should rise [1]; 2026 guidance is unpublished [3].
`
  const words = (text) => text.trim().split(/\s+/).length
  assert.ok(words(candidate) < words(DRAFT) * 0.85)
  assert.equal(revisionRejection(DRAFT, candidate), null)
})

test('a revision that discards most of the draft figures is rejected', () => {
  const candidate = '# Capacity review\n\n## Findings\n\nCapacity fell 12% in 2025 [1].\n'
  const reason = revisionRejection(DRAFT, candidate)
  assert.match(reason, /figures/)
  assert.match(reason, /2\/7/)
})

test('a draft with too few figures to judge is not rejected on figures', () => {
  const draft = '## A\n\nCapacity fell [1] and three plants closed [2].\n'
  const candidate = '## A\n\nCapacity fell [1].\n'
  assert.equal(revisionRejection(draft, candidate), null)
})
