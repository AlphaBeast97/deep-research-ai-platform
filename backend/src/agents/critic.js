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
    .map((i) => {
      const fix = asText(i?.fix)
      return {
        type: asText(i?.type) || 'other',
        severity: SEVERITIES.has(asText(i?.severity).toLowerCase())
          ? asText(i?.severity).toLowerCase()
          : 'medium',
        claim: asText(i?.claim),
        problem: asText(i?.problem),
        fix,
        // The revisor never sees the sources, so an issue without a stated
        // correction is a finding it can only guess at. Recorded for the
        // reader, withheld from the revision (see actionableIssues).
        actionable: Boolean(fix),
      }
    })
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
 * The issues the revisor can actually apply: those the critic supplied a fix
 * for. Absent `actionable` (a critique stored before this field existed) counts
 * as actionable, so reopening an old report still reads its critique as work
 * that was done.
 */
export function actionableIssues(critique) {
  return (critique?.issues || []).filter((issue) => issue.actionable !== false)
}

/**
 * Whether the critique found anything material: a high-severity issue or any
 * citation problem.
 *
 * Reported in the run log so a quiet audit is distinguishable from one that
 * found real faults, but it is not the gate on the revision pass: the
 * orchestrator revises when the critic supplied something the revisor can
 * actually act on — an issue with a stated fix, or a citation problem. A
 * critique with neither leaves the revision with no source text to check
 * against, so it is skipped (see critic.actionableIssues).
 */
export function hasMaterialIssues(critique) {
  if (!critique) return false
  return (
    critique.issues.some((i) => i.severity === 'high') ||
    critique.citationProblems.length > 0
  )
}
