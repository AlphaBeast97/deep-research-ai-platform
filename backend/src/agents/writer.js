import { chatStream } from '../llm.js'
import config from '../config.js'
import { citedIndexes } from './citations.js'
import { reviserSystem, reviserUser, writerSystem, writerUser } from './prompts.js'
import { resolveReportType } from './reportTypes.js'

/**
 * Writer agent — synthesizes all researcher output into one streamed report.
 * Tokens are pushed through `onToken` so the UI renders the report live.
 *
 * The report type chosen by the user selects the structure and the writing
 * stance; everything else about the prompt is shared.
 */
export async function writeDraft({ query, plan, research, sources, rounds, reportType, onToken, signal }) {
  const type = resolveReportType(reportType)
  return chatStream({
    system: writerSystem(type),
    user: writerUser(query, plan, research, sources, rounds),
    model: config.llm.smartModel,
    temperature: 0.5,
    onToken,
    signal,
  })
}

/** A figure: a number, with an optional unit or magnitude word. */
const FIGURE_RE = /\b\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent|bn|billion|million|trillion|thousand))?/gi

/** Citation markers are numbers too, but they are references, not facts. */
const CITATION_MARKER_RE = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g

const figuresIn = (text) =>
  new Set(
    (String(text || '')
      .replace(CITATION_MARKER_RE, ' ')
      .match(FIGURE_RE) || []).map((n) => n.replace(/\s+/g, '').toLowerCase()),
  )

/**
 * Why a revision cannot be shipped over the draft, or `null` when it can.
 *
 * This replaced a bare `wordCount(candidate) >= 120` check. A word count only
 * detected "the model produced something", and it cut both ways: a 130-word
 * stub passed, while a shorter revision that had removed unsupported claims —
 * exactly the outcome the revisor is asked for — was rejected. These are the
 * failure modes that actually matter, and all of them are cheap to detect:
 *
 * - empty output;
 * - every citation dropped, which turns a cited report into an uncited one;
 * - no section headings left, i.e. a fragment rather than a repaired document;
 * - most of the draft's figures gone. Deleting an unsupported figure is a fix,
 *   but losing the majority of them means verified content was discarded in a
 *   pass that is supposed to preserve it. The bar is lenient (fewer than half
 *   retained, and only when the draft had at least five figures) so a genuine
 *   cleanup is never mistaken for truncation.
 *
 * The caller keeps the draft when this returns a reason, and records it.
 */
export function revisionRejection(draft, candidate) {
  const text = String(candidate || '').trim()
  if (!text) return 'the revision was empty'

  const draftText = String(draft || '')

  if (citedIndexes(draftText).size > 0 && citedIndexes(text).size === 0) {
    return 'the revision dropped every citation'
  }

  if (/^##\s/m.test(draftText) && !/^##\s/m.test(text)) {
    return 'the revision has no section headings'
  }

  const before = figuresIn(draftText)
  if (before.size >= 5) {
    const after = figuresIn(text)
    let kept = 0
    for (const figure of before) if (after.has(figure)) kept++
    if (kept / before.size < 0.5) {
      return `the revision kept only ${kept}/${before.size} of the draft's figures`
    }
  }

  return null
}

/**
 * Revision pass — rewrites the draft with the critic's findings applied. Also
 * streamed, so the user watches the report be corrected rather than waiting for
 * a second silent pass.
 */
export async function reviseReport({
  query,
  plan,
  research,
  sources,
  draft,
  critique,
  reportType,
  onToken,
  signal,
}) {
  const type = resolveReportType(reportType)
  return chatStream({
    system: reviserSystem(type),
    user: reviserUser(query, plan, research, sources, draft, critique),
    model: config.llm.smartModel,
    temperature: 0.35,
    onToken,
    signal,
  })
}
