/**
 * Repairs Mermaid diagrams the writer agent gets wrong, so a diagram renders
 * instead of falling back to its own source.
 *
 * Every rule below exists because the real Mermaid 12 parser *rejected* the
 * shape in question. The error each one fixes is quoted next to it, and each has
 * a regression test against that same parser in `test/mermaid.test.js` — so a
 * rule that stops working fails the suite, and a rule that was never needed
 * would have failed it when it was written.
 *
 * The repairs are deliberately narrow. Mermaid's grammar accepts far more than
 * it rejects (`%`, `>`, `,`, `:` and `;` are all fine unquoted inside a label),
 * so quoting or rewriting "just in case" would change diagrams that already
 * render — and a quoted label ending in a backslash, for example, is *worse*
 * than the unquoted one. Only what was observed to break is touched.
 *
 * Scope: flowchart/graph statements get the full treatment; sequence diagrams
 * get arrow repair only; every other diagram type (timeline, classDiagram, …)
 * is left exactly as written, because repairing a grammar this module has not
 * been tested against risks turning a working diagram into a broken one.
 */

// A fence line inside the block — the writer is told never to nest a diagram,
// and Mermaid cannot parse the fence either.
const FENCE = /^\s*```/

// The arrow a repaired diagram falls back to, per diagram family.
const ARROW = { flowchart: '-->', sequence: '->>' }

/**
 * Arrow characters that are *never* valid Mermaid, whatever the diagram type.
 * `⟶` used as an edge operator is a lexical error: "Unrecognized text."
 */
const UNICODE_ARROWS = /[⟶⟹➔➜↦→⇒➙⢆]/g
/** Em/en dash plus `>`, e.g. `—>`: also "Unrecognized text." */
const DASH_ARROWS = /[—–]\s*>/g
/**
 * A single-dash `->` is a parse error in a flowchart (it is only legal in
 * sequence diagrams, where it means something else) — hence the lookbehind that
 * leaves `-->`, `-->>`, `-.->` and `A x--> B` alone.
 */
const SINGLE_DASH_ARROW = /(?<![-.=<>])->(?!>)/g

const OPENERS = { '[': ']', '(': ')', '{': '}' }
const CLOSERS = { ']': '[', ')': '(', '}': '{' }

/** Statements whose lines are metadata, not node/edge syntax. */
const STATEMENT = /^\s*(?:%%|style\b|classDef\b|class\b|linkStyle\b|click\b|direction\b)/i
/** Keywords that are structural rather than statements. */
const KEYWORD = /^\s*(?:end|subgraph|flowchart|graph)\b/i

/** A label that is already quoted is left alone — this is what makes repair idempotent. */
const isQuoted = (text) => /^"[\s\S]*"$/.test(text.trim())

/**
 * The characters that actually need a quoted label. Parentheses are structural
 * in Mermaid's grammar, so `[Costs (2020-2022)]` is a parse error while
 * `["Costs (2020-2022)"]` is not; a stray `"` or `[`/`]` inside a label breaks
 * it for the same reason.
 */
const needsQuotes = (text) => !isQuoted(text) && /[()"[\]]/.test(text)

/** Escape what cannot survive inside a quoted Mermaid label. */
const escapeLabel = (text) =>
  text
    // `"` would close the label early; Mermaid reads #quot; as a quote.
    .replace(/"/g, '#quot;')
    // A trailing backslash escapes the closing quote, so it must be doubled.
    .replace(/\\+$/, (match) => match + match)

/** Which diagram family a block is, from its first meaningful line. */
function detectFamily(lines) {
  for (const line of lines) {
    const text = line.trim()
    if (!text || text.startsWith('%%')) continue
    if (/^(?:flowchart|graph)\b/i.test(text)) return 'flowchart'
    if (/^sequenceDiagram\b/i.test(text)) return 'sequence'
    return 'other'
  }
  return 'other'
}

/**
 * Rewrite the arrow operators in a line, skipping anything inside a quoted
 * label or an edge label (`-->|text|`) — text is not syntax.
 */
function repairArrows(line, family) {
  const arrow = ARROW[family]
  if (!arrow) return line
  return line
    .split(/("(?:[^"]*)"|\|[^|]*\|)/)
    .map((segment, index) => {
      if (index % 2) return segment // a protected "label" or |label| segment
      const replaced = segment.replace(UNICODE_ARROWS, arrow).replace(DASH_ARROWS, arrow)
      return family === 'flowchart' ? replaced.replace(SINGLE_DASH_ARROW, '-->') : replaced
    })
    .join('')
}

/**
 * `subgraph Client (frontend)` is a parse error because the title's parentheses
 * are read as syntax; `subgraph "Client (frontend)"` is not. The `id["title"]`
 * form is left to the label pass, so it is excluded here.
 */
function repairSubgraphTitle(line) {
  return line.replace(/^(\s*subgraph\s+)([^"[]+)$/, (match, head, rest) =>
    needsQuotes(rest) ? `${head}"${escapeLabel(rest.trim())}"` : match,
  )
}

/**
 * The doubled-delimiter node shapes — `((text))`, `{{text}}`, `[[text]]`. Handled
 * before the general label pass because their delimiters are two characters
 * wide, so `((Total (2020)))` has to be read as a `((` … `))` pair around
 * `Total (2020)` rather than as three nested parentheses.
 */
function repairDoubledDelimiters(line) {
  return line
    .replace(/\(\(([^"(]*\([^"()]*\)[^"()]*)\)\)/g, (match, text) =>
      needsQuotes(text) ? `(("${escapeLabel(text.trim())}"))` : match,
    )
    .replace(/\{\{([^"{}]*)\}\}/g, (match, text) =>
      needsQuotes(text) ? `{{"${escapeLabel(text.trim())}"}}` : match,
    )
    .replace(/\[\[([^"[\]]*)\]\](?!\])/g, (match, text) =>
      needsQuotes(text) ? `[["${escapeLabel(text.trim())}"]]` : match,
    )
}

/** True when every label opener on the line has a matching closer. */
function labelsAreBalanced(line) {
  const stack = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      const end = line.indexOf('"', i + 1)
      if (end === -1) return false
      i = end + 1
      continue
    }
    if (OPENERS[ch]) stack.push(ch)
    else if (CLOSERS[ch]) {
      if (stack.pop() !== CLOSERS[ch]) return false
    }
    i++
  }
  return stack.length === 0
}

/**
 * Quote every unquoted label that needs it: node labels in all their shapes,
 * edge labels (`-->|Costs (2020)| B`), and — via the passes above — subgraph
 * titles and doubled delimiters.
 *
 * Everything from an opener to its closer is captured as label text, so a
 * parenthesis inside a label is never mistaken for syntax. A line whose
 * delimiters do not balance is returned untouched: guessing at where a label
 * ends is how a repair turns one broken diagram into two.
 */
function repairLabels(line) {
  if (!labelsAreBalanced(line)) return line

  let out = ''
  const frames = []
  const emitText = (text) => {
    if (frames.length) frames[frames.length - 1].text += text
    else out += text
  }

  let i = 0
  while (i < line.length) {
    const ch = line[i]

    if (ch === '"') {
      const end = line.indexOf('"', i + 1)
      const stop = end === -1 ? line.length : end + 1
      emitText(line.slice(i, stop))
      i = stop
      continue
    }

    // Edge labels: -->|text| B
    if (!frames.length && ch === '|') {
      const end = line.indexOf('|', i + 1)
      if (end !== -1) {
        const content = line.slice(i + 1, end)
        out += needsQuotes(content) ? `|"${escapeLabel(content.trim())}"|` : line.slice(i, end + 1)
        i = end + 1
        continue
      }
    }

    if (OPENERS[ch]) {
      frames.push({ open: ch, text: '' })
      i++
      continue
    }

    if (frames.length && CLOSERS[ch] === frames[frames.length - 1].open) {
      const frame = frames.pop()
      const body = frame.text
      const rendered = needsQuotes(body) ? `"${escapeLabel(body.trim())}"` : body
      // Re-emitted through the parent frame when nested, so an inner label
      // belonging to an outer one stays inside it.
      if (frames.length) frames[frames.length - 1].text += frame.open + rendered + ch
      else out += frame.open + rendered + ch
      i++
      continue
    }

    emitText(ch)
    i++
  }

  return out
}

/**
 * Prose the model wrote *inside* the fence — a sentence ("This diagram shows
 * the chain.") or a bare comparison ("School_A vs. School_B") — is a parse error.
 * A multi-token line is only diagram syntax when one of its tokens is nothing
 * but link characters (`-->`, `---`, `~~~`, `&`); every other bare multi-token
 * line is prose. Single tokens are node ids and survive, as do `end`,
 * `subgraph …` and `style …` / `class …` statements.
 */
const STRUCTURE = /(-->|---|==>|-\.-|\[|\{|\(|\||:|%%|<)/
const CONNECTOR = /^(?:[-=<>~&]+)$/
function isStrayProse(line) {
  const text = line.trim()
  if (!text || STRUCTURE.test(text) || KEYWORD.test(text)) return false
  const tokens = text.split(/\s+/)
  return tokens.length > 1 && !tokens.some((token) => CONNECTOR.test(token))
}

/** One line of a flowchart: drop what Mermaid cannot parse, repair what it can. */
function repairFlowchartLine(line, depth) {
  if (FENCE.test(line)) return null
  const isEnd = /^\s*end\s*;?\s*$/i.test(line)
  // An `end` with no open subgraph is a parse error; drop it.
  if (isEnd && depth === 0) return null
  if (STATEMENT.test(line)) return line
  if (isStrayProse(line)) return null
  return repairArrows(repairLabels(repairDoubledDelimiters(repairSubgraphTitle(line))), 'flowchart')
}

/**
 * Repair a diagram's source. Idempotent: repairing repaired text returns it
 * unchanged, so applying this at render time and again on export is safe.
 */
export function repairMermaid(source) {
  const text = String(source ?? '')
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const family = detectFamily(lines)

  // Only the flowchart grammar has been verified against the parser; the
  // others get the arrow fix at most.
  if (family === 'other') return text

  if (family === 'sequence') {
    return lines
      .filter((line) => !FENCE.test(line))
      .map((line) => repairArrows(line, 'sequence'))
      .join('\n')
  }

  let depth = 0
  const out = []
  for (const line of lines) {
    const repaired = repairFlowchartLine(line, depth)
    if (/^\s*subgraph\b/i.test(line)) depth++
    else if (/^\s*end\s*;?\s*$/i.test(line)) depth = Math.max(0, depth - 1)
    if (repaired !== null) out.push(repaired)
  }
  return out.join('\n')
}

/**
 * Repair every ```mermaid block in a Markdown document, so an exported `.md`
 * carries diagrams that render rather than the same broken source the UI had to
 * work around.
 */
export function repairMermaidBlocks(markdown) {
  return String(markdown ?? '').replace(
    /(```mermaid[^\n]*\n)([\s\S]*?)(```)/g,
    (match, open, body, close) => `${open}${repairMermaid(body).replace(/\n+$/, '')}\n${close}`,
  )
}
