import { chatJSON } from '../llm.js'
import config from '../config.js'
import { asText } from './normalize.js'
import { citedIndexes } from './citations.js'
import { resolveReportType } from './reportTypes.js'
import { CRITIC_SYSTEM, criticUser } from './prompts.js'

const SEVERITIES = new Set(['high', 'medium', 'low'])
const VERDICTS = new Set(['solid', 'minor-issues', 'needs-revision'])

/** Exported for tests: the critique shape is the contract with the revisor. */
export function normalise(data) {
  const issues = (Array.isArray(data.issues) ? data.issues : [])
    .map((i) => ({
      type: asText(i?.type) || 'other',
      severity: SEVERITIES.has(asText(i?.severity).toLowerCase())
        ? asText(i?.severity).toLowerCase()
        : 'medium',
      claim: asText(i?.claim),
      problem: asText(i?.problem),
      fix: asText(i?.fix),
    }))
    .filter((i) => i.problem)

  const citationProblems = (Array.isArray(data.citationProblems) ? data.citationProblems : [])
    .map((c) => ({ citation: asText(c?.citation), problem: asText(c?.problem) }))
    .filter((c) => c.problem)

  const recommendations = (Array.isArray(data.recommendations) ? data.recommendations : [])
    .map(asText)
    .filter(Boolean)

  const verdictRaw = asText(data.verdict).toLowerCase()
  let verdict = VERDICTS.has(verdictRaw) ? verdictRaw : 'minor-issues'
  // A high-severity issue always outranks a lenient self-assessment.
  if (issues.some((i) => i.severity === 'high')) verdict = 'needs-revision'

  return { verdict, issues, citationProblems, recommendations }
}

/**
 * Critic agent — audits a draft report against the numbered sources it was
 * written from and returns a structured critique. It deliberately does not
 * rewrite anything; that is the revisor's job.
 *
 * Two things make the audit actually able to catch what it claims to catch:
 *
 * - It reads the same evidence the researcher did. The draft was written from
 *   findings extracted out of full page text, so auditing it against 800-char
 *   snippets flags honest figures as "overreach" (the snippet never contained
 *   them) and misses real miscitations (the support is in the article body).
 *   The sources the draft actually cites are therefore expanded to full text,
 *   capped by `CRITIC_FULL_TEXT_SOURCES` to keep the prompt bounded.
 * - It knows which deliverable was requested, so the STRUCTURE check has
 *   something to check against instead of judging every report as an analyst
 *   report.
 */
export async function critique({ query, research, sources, draft, reportType, signal }) {
  const type = resolveReportType(reportType)

  // Cited sources first (ascending index), then truncated to the configured cap.
  const cited = citedIndexes(draft)
  const expand = sources
    .filter((s) => cited.has(s.index))
    .slice(0, config.research.criticFullTextSources)
    .map((s) => s.index)

  const { data, usage } = await chatJSON({
    system: CRITIC_SYSTEM,
    user: criticUser(query, research, sources, draft, { type, expand }),
    model: config.llm.smartModel,
    temperature: 0.1,
    signal,
  })
  return { critique: normalise(data), usage, fullTextSources: expand.length }
}

/**
 * Whether the critique found anything material.
 *
 * Reported in the run log, but deliberately NOT a gate on the revision pass:
 * the revisor runs whenever the critique stage is enabled. Gating on the
 * critic's own lenient self-assessment meant the revision stage silently never
 * executed on a "solid" verdict, and a second pass reliably tightens
 * quantification and citation quality regardless. The verdict is surfaced to
 * the user instead of being used to skip work.
 */
export function hasMaterialIssues(critique) {
  if (!critique) return false
  return (
    critique.issues.some((i) => i.severity === 'high') ||
    critique.citationProblems.length > 0
  )
}
