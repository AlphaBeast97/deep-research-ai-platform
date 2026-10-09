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
 */
const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g

const numbersIn = (group) =>
  group
    .split(',')
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter(Number.isFinite)

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
 * Drop citation numbers that do not resolve to a real source. A group such as
 * `[2, 9]` becomes `[2]`; a group with nothing valid left is removed entirely.
 */
export function sanitizeCitations(report, validIndexes) {
  const valid = validIndexes instanceof Set ? validIndexes : new Set(validIndexes)
  return String(report || '')
    .replace(CITATION_RE, (_match, group) => {
      const kept = numbersIn(group).filter((n) => valid.has(n))
      return kept.length ? `[${kept.join(', ')}]` : ''
    })
    .replace(/[ \t]{2,}/g, ' ')
}
