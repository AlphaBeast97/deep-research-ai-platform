/**
 * Regression tests for `lib/mermaid.js`, run against the **real Mermaid 12
 * parser** — the same library and version the UI renders with. A repaired
 * diagram is only repaired if that parser accepts it, so every case here is
 * handed to it rather than string-compared.
 *
 * Mermaid needs a DOM to parse, so the harness below installs jsdom globally
 * before importing it. That is the only reason jsdom is a devDependency.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { repairMermaid, repairMermaidBlocks } from '../src/lib/mermaid.js'

async function loadParser() {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  for (const key of ['DOMParser', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'MutationObserver', 'getComputedStyle']) {
    globalThis[key] = dom.window[key]
  }
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  return mermaid
}

const mermaid = await loadParser()

const parses = async (source) => {
  try {
    await mermaid.parse(source)
    return true
  } catch {
    return false
  }
}

// ── The diagrams the writer agent gets wrong ───────────────────────────────
// Each one was captured from real output (or a parser-verified variant of it)
// and is asserted to *fail* as written before the repair is asserted to fix it.
const BROKEN = {
  'Unicode long arrow ⟶ between nodes': 'flowchart TD\nA[Start] ⟶ B[End]\n',
  'Unicode arrow → between nodes': 'flowchart TD\nA[Start] → B[End]\n',
  'Unicode arrow inside a longer diagram': [
    'flowchart TD',
    'A[Remote Work] ⟶ B[Office Vacancy]',
    'B --> C[Tax Base]',
  ].join('\n'),
  'em-dash arrow —>': 'flowchart TD\nA[Start] —> B[End]\n',
  'en-dash arrow –>': 'flowchart TD\nA[Start] –> B[End]\n',
  'single-dash arrow ->': 'flowchart TD\nA[Start] -> B[End]\n',
  'parentheses in a rectangle label': 'flowchart TD\nA[Start] --> B[Costs (2020-2022)]\n',
  'parentheses in a decision label': 'flowchart TD\nA[Start] --> B{Costs (2020)}\n',
  'parentheses in a circle label': 'flowchart TD\nA[Start] --> B((Total (2020)))\n',
  'parentheses in a stadium label': 'flowchart TD\nA([Start (now)]) --> B[End]\n',
  'brackets in a label': 'flowchart TD\nA[Start] --> B[Array [1,2]]\n',
  'double quotes inside a label': 'flowchart TD\nA[Start] --> B[The "big" shift]\n',
  'parentheses in a subgraph title': 'flowchart TD\nsubgraph Client (frontend)\n  A[Start] --> B[End]\nend\n',
  'parentheses in an edge label': 'flowchart TD\nA[Start] -->|Costs (2020)| B[End]\n',
  'a sentence of prose inside the fence': 'flowchart TD\nA[Start] --> B[End]\nThis diagram shows the chain.\n',
  'an end with no open subgraph': 'flowchart TD\nA[Start] --> B[End]\nstyle A fill:#f9f,stroke:#333\nend\n',
  'a nested fence inside the block': 'flowchart TD\n```\nA[Start] --> B[End]\n',
  'a Unicode arrow in a sequence diagram': 'sequenceDiagram\n  A ⟶ B: hello\n',
}

/**
 * The diagram from the report this work came from — an evidence-review report
 * whose flowchart fell back to its source because of two independent faults
 * (`⟶` on the second line and `(2020-2022)` in a later label).
 */
const REPORT_DIAGRAM = [
  'flowchart TD',
  'A[Permanent Remote & Hybrid Work] ⟶ B[Commercial Real Estate & Office Vacancy]',
  '    A --> C[Spatial Shift in Retail & Hospitality Spending]',
  '    A --> D[Residential Demand & Suburban Migration]',
  '',
  '    B --> E[Valuation Drops: 20%-45% Nationally, >50% in Major Hubs]',
  '    B --> F[Municipal Fiscal Pressure & Property Tax Risk]',
  '',
  '    C --> G[Urban Core Revenue Loss: e.g., 32.5% in City of London]',
  '    C --> H[Labor Market Inequality in Local Services]',
  '',
  '    D --> I[Real House Prices +20%, Rents +8% (2020-2022)]',
  '    D --> J[Suburban and Smaller City Growth]',
  '',
  '    style A fill:#f9f,stroke:#333,stroke-width:2px',
  '    style B fill:#bbf,stroke:#333,stroke-width:1px',
  '    style C fill:#bbf,stroke:#333,stroke-width:1px',
  '    style D fill:#bbf,stroke:#333,stroke-width:1px',
].join('\n')

test('the report diagram in question fails as written', async () => {
  assert.equal(await parses(REPORT_DIAGRAM), false, 'the raw diagram should be a parse error')
})

test('every broken shape is repaired into something Mermaid parses', async () => {
  for (const [name, source] of Object.entries({ ...BROKEN, 'the report diagram': REPORT_DIAGRAM })) {
    assert.equal(await parses(repairMermaid(source)), true, `${name} still does not parse`)
  }
})

test('the faults in the report diagram are real, not just in the test corpus', async () => {
  const arrowOnly = REPORT_DIAGRAM.replace('⟶', '-->')
  const labelsOnly = REPORT_DIAGRAM.replace(
    '[Real House Prices +20%, Rents +8% (2020-2022)]',
    '["Real House Prices +20%, Rents +8% (2020-2022)"]',
  )
  // Two independent faults: fixing either one alone still fails.
  assert.equal(await parses(arrowOnly), false)
  assert.equal(await parses(labelsOnly), false)
  assert.equal(await parses(repairMermaid(REPORT_DIAGRAM)), true)
})

test('the repaired report diagram keeps its structure', () => {
  const repaired = repairMermaid(REPORT_DIAGRAM)
  assert.match(repaired, /^flowchart TD$/m)
  // The arrow became ASCII without disturbing the edge.
  assert.match(repaired, /^A\[Permanent Remote & Hybrid Work\] --> B\[Commercial Real Estate & Office Vacancy\]$/m)
  // The label that broke the parse is quoted, and its text is intact.
  assert.match(repaired, /D --> I\["Real House Prices \+20%, Rents \+8% \(2020-2022\)"\]/)
  // Labels that never needed quotes are left exactly as written.
  assert.match(repaired, /B --> E\[Valuation Drops: 20%-45% Nationally, >50% in Major Hubs\]/)
  assert.match(repaired, /style D fill:#bbf,stroke:#333,stroke-width:1px/)
})

// ── Diagrams that already work must not be touched ─────────────────────────
const VALID = {
  'plain flowchart': 'flowchart TD\nA[Start] --> B[End]\n',
  'already-quoted label with parentheses': 'flowchart TD\nA[Start] --> B["Costs (2020)"]\n',
  'old graph keyword': 'graph TD\nA[Start] --> B[End]\n',
  'punctuation Mermaid accepts unquoted': 'flowchart TD\nA[Ratio: 3 & more, 20%] --> B[One; two]\n',
  'dotted and thick arrows': 'flowchart TD\nA[Start] -.-> B[End]\nA ==> C[End]\n',
  'an arrow inside a label': 'flowchart TD\nA[Growth --> 2026] --> B[End]\n',
  'html line break in a label': 'flowchart TD\nA[Line<br/>two] --> B[End]\n',
  'comments, styles and classDefs': 'flowchart TD\n%% a comment\nA[Start] --> B[End]\nstyle A fill:#f9f\nclassDef big font-size:20px\n',
  'a closed subgraph': 'flowchart TD\nsubgraph "Client (frontend)"\n  A[Start] --> B[End]\nend\n',
  'a sequence diagram': 'sequenceDiagram\n  A->>B: hello (there)\n  B-->>A: back\n',
  'a timeline (untouched grammar)': 'timeline\n  title Timeline (2020)\n  2020 : first (thing)\n',
  'a class diagram (untouched grammar)': 'classDiagram\n  class User {\n    +login(password)\n  }\n',
}

test('diagrams that already parse are returned unchanged', async () => {
  for (const [name, source] of Object.entries(VALID)) {
    assert.equal(repairMermaid(source), source, `${name} was modified`)
    assert.equal(await parses(repairMermaid(source)), true, `${name} does not parse`)
  }
})

test('repair is idempotent', () => {
  for (const source of [...Object.values(BROKEN), ...Object.values(VALID), REPORT_DIAGRAM]) {
    const once = repairMermaid(source)
    assert.equal(repairMermaid(once), once)
  }
})

// ── Markdown-level repair (the .md export) ─────────────────────────────────
test('repairMermaidBlocks fixes diagrams inside a report and leaves code alone', () => {
  const markdown = [
    'Intro sentence.',
    '',
    '```mermaid',
    'flowchart TD',
    'A[Start] ⟶ B[Costs (2020)]',
    '```',
    '',
    'Some `inline code` and a fence that is not a diagram:',
    '',
    '```js',
    'const a = (b) => b',
    '```',
  ].join('\n')

  const repaired = repairMermaidBlocks(markdown)
  assert.match(repaired, /A\[Start\] --> B\["Costs \(2020\)"\]/)
  assert.match(repaired, /const a = \(b\) => b/)
  assert.match(repaired, /Intro sentence\./)

  // Blocks that need no repair come back byte-identical.
  const clean = '```mermaid\nflowchart TD\nA --> B\n```\n'
  assert.equal(repairMermaidBlocks(clean), clean)
  // And repairing twice changes nothing more than repairing once.
  assert.equal(repairMermaidBlocks(repaired), repaired)
})
