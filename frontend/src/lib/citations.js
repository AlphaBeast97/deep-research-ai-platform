/**
 * Citation parsing, shared by the renderer and the exporters.
 *
 * The report marks claims with `[n]` and `[1, 4]`. Two places care about that
 * syntax and they must agree exactly: `Markdown.jsx`, which turns each marker
 * into a chip, and the export path, which lists only the sources the report
 * actually cites. A second copy of the pattern is how those two drift apart, so
 * it lives here.
 */

/**
 * `[2]`, `[1, 4]` — but not `[3](url)`, which is a Markdown link.
 *
 * Numbers are capped at three digits for the same reason the backend caps them:
 * a run numbers a few dozen sources, so `[2024]` in prose is a year, not a
 * reference. Without the cap the renderer turned it into a chip pointing at
 * source 2024, and the exporters tried to list that source. The backend rule in
 * `agents/citations.js` mirrors this one — the two must stay identical.
 */
export function citationRegExp() {
  return /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g
}

/** More than this many numbers in one bracket is prose, not a citation. */
export const MAX_MARKERS_PER_GROUP = 6

/** Every source number the report cites, as a Set of numbers. */
export function citedIndexes(report) {
  const cited = new Set()
  for (const match of String(report ?? '').matchAll(citationRegExp())) {
    const numbers = match[1].split(',').map((n) => Number(n.trim()))
    if (numbers.length > MAX_MARKERS_PER_GROUP) continue
    for (const n of numbers) cited.add(n)
  }
  return cited
}

/**
 * The sources a saved artifact should list: those the report cites.
 *
 * A run discovers more sources than it ends up citing, and the in-app panel
 * shows all of them (dimming the unused ones) because there they are evidence of
 * what was searched. In a PDF or a .docx they are noise — an appendix entry with
 * no `[n]` pointing at it — so exports get the cited ones only.
 *
 * Numbers are deliberately *not* renumbered: the report's markers say `[7]`, so
 * the list has to keep calling that source 7, gaps and all.
 */
export function citedSources(sources = [], report = '') {
  const cited = citedIndexes(report)
  return sources.filter((source) => cited.has(Number(source.index)))
}
