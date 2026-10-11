/**
 * Tests for the export path (`lib/export.js`, `lib/docx.js`).
 *
 * These build the *actual artifacts* rather than poking at helpers: the print
 * document is the HTML the print window receives, and the Word document is the
 * real OOXML zip read back out of the Blob. The rule under test is that the
 * Sources appendix carries what the report cites and nothing else — an entry
 * nothing points at is noise in a file someone keeps.
 *
 * jsdom supplies the DOM both exporters expect (the print window, and the
 * XML APIs `docx` reaches for).
 */

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'
import test from 'node:test'

const dom = new (await import('jsdom')).JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const key of ['XMLSerializer', 'Blob', 'DOMParser', 'Node', 'Element', 'getComputedStyle']) {
  if (dom.window[key]) globalThis[key] = dom.window[key]
}

const { printReport, sourcesSection } = await import('../src/lib/export.js')
const { buildDocxBlob } = await import('../src/lib/docx.js')

const REPORT = '# Remote work\n\nOffice vacancy rose [1]. A second claim [3].'
const SOURCES = [
  { index: 1, title: 'CITED ONE', url: 'https://a.example/x' },
  { index: 2, title: 'NEVER CITED', url: 'https://b.example/y' },
  { index: 3, title: 'CITED THREE', url: 'https://c.example/z' },
]

/** Read a named entry out of a zip (the OOXML package) without a zip library. */
function readZipEntry(buffer, name) {
  const EOCD = 0x06054b50
  let eocd = buffer.length - 22
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== EOCD) eocd--
  if (eocd < 0) throw new Error('not a zip file')

  const entries = buffer.readUInt16LE(eocd + 10)
  let p = buffer.readUInt32LE(eocd + 16)
  for (let i = 0; i < entries; i++) {
    const method = buffer.readUInt16LE(p + 10)
    const compressedSize = buffer.readUInt32LE(p + 20)
    const nameLength = buffer.readUInt16LE(p + 28)
    const extraLength = buffer.readUInt16LE(p + 30)
    const commentLength = buffer.readUInt16LE(p + 32)
    const localOffset = buffer.readUInt32LE(p + 42)
    const entryName = buffer.toString('utf8', p + 46, p + 46 + nameLength)

    if (entryName === name) {
      const headerNameLength = buffer.readUInt16LE(localOffset + 26)
      const headerExtraLength = buffer.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + headerNameLength + headerExtraLength
      const data = buffer.subarray(start, start + compressedSize)
      return method === 0 ? data : inflateRawSync(data)
    }
    p += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`zip entry not found: ${name}`)
}

test('sourcesSection keeps the ids the report citations point at', () => {
  const html = sourcesSection([{ index: 4, title: 'Four', url: 'https://d.example/p' }])
  assert.match(html, /id="source-4"/)
  assert.match(html, /href="https:\/\/d\.example\/p"/)
  // No sources at all means no heading, not an empty one.
  assert.equal(sourcesSection([]), '')
})

test('sourcesSection escapes untrusted titles and URLs', () => {
  const html = sourcesSection([{ index: 1, title: '<img src=x onerror=1>', url: 'https://e.example/?a="b"' }])
  assert.equal(html.includes('<img src=x'), false)
  assert.match(html, /&lt;img src=x onerror=1&gt;/)
})

test('the printed PDF document lists cited sources only', () => {
  let written = ''
  globalThis.window.open = () => ({
    document: { write: (html) => { written += html }, close: () => {} },
    focus: () => {},
    print: () => {},
  })

  printReport({ title: 'Report', html: '<h1>Report</h1><p>Office vacancy rose <a href="#source-1">1</a>.</p>', report: REPORT, sources: SOURCES })

  assert.match(written, /id="source-1"/)
  assert.match(written, /id="source-3"/)
  assert.equal(written.includes('NEVER CITED'), false, 'an uncited source leaked into the PDF')
  assert.match(written, /CITED ONE/)
})

test('the .docx carries cited sources only, and is a real OOXML package', async () => {
  const blob = await buildDocxBlob({ title: 'Report', report: REPORT, sources: SOURCES })
  const buffer = Buffer.from(await blob.arrayBuffer())
  const xml = readZipEntry(buffer, 'word/document.xml').toString('utf8')

  assert.match(xml, /CITED ONE/)
  assert.match(xml, /CITED THREE/)
  assert.equal(xml.includes('NEVER CITED'), false, 'an uncited source leaked into the .docx')
  assert.match(xml, />Sources</)
})

test('a report that cites nothing produces no Sources section', async () => {
  const blob = await buildDocxBlob({ title: 'Report', report: 'No markers here.', sources: SOURCES })
  const xml = readZipEntry(Buffer.from(await blob.arrayBuffer()), 'word/document.xml').toString('utf8')
  assert.equal(xml.includes('NEVER CITED'), false)
  assert.equal(xml.includes('CITED ONE'), false)
})
