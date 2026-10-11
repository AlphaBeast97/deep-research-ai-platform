/**
 * Tests for `lib/citations.js`.
 *
 * Two behaviours matter here and neither is cosmetic: the renderer decides what
 * becomes a clickable chip from the same patterns, and the exporters decide what
 * belongs in a saved document's Sources appendix. If they disagree, a PDF lists
 * a source nothing points at — or worse, a chip points at a source the export
 * left out.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { citedIndexes, citedSources } from '../src/lib/citations.js'

const SOURCES = [
  { index: 1, title: 'Cited one', url: 'https://a.example' },
  { index: 2, title: 'Uncited', url: 'https://b.example' },
  { index: 3, title: 'Cited three', url: 'https://c.example' },
  { index: 4, title: 'Cited in a group', url: 'https://d.example' },
]

test('citedIndexes finds single and grouped markers', () => {
  const cited = citedIndexes('A claim [1] and another [3, 4].')
  assert.deepEqual([...cited].sort((a, b) => a - b), [1, 3, 4])
})

test('citedIndexes ignores markdown links and prose brackets', () => {
  // A markdown link is not a citation, and neither is a long bracketed list.
  assert.deepEqual([...citedIndexes('A [link](https://example.com) here.')], [])
  assert.deepEqual([...citedIndexes('Digits [1, 2, 3, 4, 5, 6, 7] are not a citation.')], [])
})

test('citedIndexes tolerates an empty report', () => {
  assert.deepEqual([...citedIndexes('')], [])
  assert.deepEqual([...citedIndexes(undefined)], [])
})

test('citedSources drops the sources the report never cites', () => {
  const report = 'A claim [1]. Another [3, 4].'
  const exported = citedSources(SOURCES, report)
  assert.deepEqual(
    exported.map((s) => s.index),
    [1, 3, 4],
  )
  assert.equal(exported.some((s) => s.index === 2), false)
})

test('citedSources keeps original numbering — never renumbers', () => {
  // The report says [7], so the appendix has to call that source 7 even though
  // it is the only entry in the list.
  const exported = citedSources([{ index: 7, title: 'Seven' }], 'Claim [7].')
  assert.deepEqual(exported, [{ index: 7, title: 'Seven' }])
})

test('citedSources returns nothing when a report cites nothing', () => {
  // A stopped or empty run has no citations, so the appendix is empty rather
  // than a list nobody can resolve.
  assert.deepEqual(citedSources(SOURCES, ''), [])
  assert.deepEqual(citedSources(SOURCES, 'A report with no markers.'), [])
})

test('citedSources matches the citation syntax the renderer chips', () => {
  // `[4]` inside a group and `[4]` on its own are the same citation.
  assert.equal(citedSources(SOURCES, 'Grouped [1, 4]').length, 2)
  assert.equal(citedSources(SOURCES, 'Separate [1] and [4]').length, 2)
})
