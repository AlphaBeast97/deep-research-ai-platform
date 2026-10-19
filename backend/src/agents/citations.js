/**
 * Citation integrity.
 *
 * The report is model output, so a citation number can point at a source that
 * does not exist (a hallucinated `[7]` when there are five sources). The UI
 * renders every `[n]` as a clickable chip, so a broken number is a dead chip —
 * a visible integrity failure. These two helpers measure that and guarantee it
 * cannot survive into a stored report.
 *
 * The negative lookahead keeps real Markdown links (`[text](url)`) untouched,
 * and mirrors the rule the frontend uses to turn citations into chips.
 *
 * Numbers are capped at three digits on purpose. A run numbers a few dozen
 * sources, so a four-digit bracket is prose — usually a year — and treating it
 * as a citation both inflated the reference count and, worse, let
 * `sanitizeCitations` delete `[2024]` from the report. The frontend keeps the
 * same pattern (it chips what this audits), so the two copies move together.
 */
export const CITATION_RE = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g

// ``` … ``` and ~~~ … ~~~ fences. Capturing, so `String.split` keeps them.
const FENCED_BLOCK_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g

const numbersIn = (group) =>
  group
    .split(',')
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter(Number.isFinite)

/** Markers are removed by swapping in a sentinel, so the tidy-up below can
 *  collapse the gap around a deletion without touching the rest of the text. */
const REMOVED = '\u0000'

/**
 * Measure the citation graph of a report.
 *
 * @returns {{
 *   references: number,        // total citation markers in the report
 *   citedSourceCount: number,  // distinct sources actually cited
 *   sourceCount: number,       // distinct sources available
 *   coverage: number,          // % of available sources that were cited
 *   invalid: number[],         // cited numbers with no matching source
 *   uncited: number[],         // source numbers never cited
 * }}
 */
export function auditCitations(report, sources) {
  const available = [...new Set(sources.map((s) => s.index))].sort((a, b) => a - b)
  const valid = new Set(available)
  const cited = new Set()
  const invalid = new Set()
  let references = 0

  for (const match of String(report || '').matchAll(CITATION_RE)) {
    for (const n of numbersIn(match[1])) {
      references++
      if (valid.has(n)) cited.add(n)
      else invalid.add(n)
    }
  }

  const uncited = available.filter((n) => !cited.has(n))

  return {
    references,
    citedSourceCount: cited.size,
    sourceCount: available.length,
    coverage: available.length ? Math.round((cited.size / available.length) * 100) : 0,
    invalid: [...invalid].sort((a, b) => a - b),
    uncited,
  }
}

/**
 * The set of source numbers a report actually cites. Used to decide which
 * sources a reviewer needs in full: see `criticUser`.
 */
export function citedIndexes(report) {
  const cited = new Set()
  for (const match of String(report || '').matchAll(CITATION_RE)) {
    for (const n of numbersIn(match[1])) cited.add(n)
  }
  return cited
}

/**
 * Drop citation numbers that do not resolve to a real source. A group such as
 * `[2, 9]` becomes `[2]`; a group with nothing valid left is removed entirely.
 *
 * Two things this deliberately does NOT do:
 *
 * - It never rewrites text that was not affected by a deletion. An earlier
 *   version collapsed every run of two spaces in the whole report, which
 *   silently flattened nested Markdown lists — the tidy-up is now confined to
 *   the gap a removed marker leaves.
 * - It never touches fenced blocks (Mermaid diagrams, code samples), where
 *   indentation is meaning rather than whitespace.
 */
export function sanitizeCitations(report, validIndexes) {
  const valid = validIndexes instanceof Set ? validIndexes : new Set(validIndexes)
  const GAP_RE = new RegExp(`[ \\t]*${REMOVED}[ \\t]*`, 'g')

  const strip = (text) =>
    text
      .replace(CITATION_RE, (_match, group) => {
        const kept = numbersIn(group).filter((n) => valid.has(n))
        return kept.length ? `[${kept.join(', ')}]` : REMOVED
      })
      // Keep a single space only when a removed marker sat between two words;
      // otherwise close up entirely ("claim [7]." → "claim.").
      .replace(GAP_RE, (_match, offset, whole) => {
        const before = whole[offset - 1] ?? ''
        const after = whole[offset + _match.length] ?? ''
        return /\w/.test(before) && /\w/.test(after) ? ' ' : ''
      })

  // `split` keeps each fenced block at an odd index (the pattern is capturing).
  return String(report || '')
    .split(FENCED_BLOCK_RE)
    .map((part, i) => (i % 2 ? part : strip(part)))
    .join('')
}
