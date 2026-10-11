import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceIndex, normalizeUrl } from '../src/agents/sources.js'

const result = (url, score = 1) => ({ url, title: 'T', snippet: 's', score })

test('a URL is numbered once; the sub-question that meets it again reuses it', () => {
  const index = new SourceIndex()

  const first = index.add(result('https://a.test/x'), 'q1')
  const again = index.add(result('https://a.test/x', 0.2), 'q2')

  assert.equal(first.isNew, true)
  assert.equal(again.isNew, false)
  // The same source object, so a later sub-question can cite it rather than
  // having its best result silently withheld.
  assert.equal(again.source, first.source)
  assert.equal(again.source.index, 1)
  assert.equal(index.size, 1)
})

test('numbering is sequential and global to the run', () => {
  const index = new SourceIndex()
  index.add(result('https://a.test'), 'q1')
  index.add(result('https://b.test'), 'q1')
  const third = index.add(result('https://c.test'), 'q2')
  assert.equal(third.source.index, 3)
  assert.equal(third.source.id, 's3')
})

test('trailing slashes and fragments do not create duplicate sources', () => {
  const index = new SourceIndex()
  index.add(result('https://a.test/report'), 'q1')
  const duplicate = index.add(result('https://a.test/report/#top'), 'q2')
  assert.equal(duplicate.isNew, false)
  assert.equal(index.size, 1)
})

test('a result with no URL is not a source', () => {
  const index = new SourceIndex()
  assert.equal(index.add({ title: 'no url' }, 'q1'), null)
  assert.equal(index.size, 0)
})

test('normalizeUrl ignores case, fragments and trailing slashes', () => {
  assert.equal(normalizeUrl('https://A.test/Report/#top'), 'https://a.test/report')
})
