import {
  ANALYST_SPEC,
  BRIEF_SPEC,
  COMPARISON_SPEC,
  EVIDENCE_SPEC,
  RISK_SPEC,
  TIMELINE_SPEC,
} from './prompts.js'

/**
 * The report types a user can choose from.
 *
 * Each type is a genuinely different deliverable, not a length setting: a risk
 * register and a chronology answer different questions about the same topic, so
 * they get different structures and different writing stances.
 *
 * `style` and `spec` are prompt text and never leave the server. Only the
 * metadata in `REPORT_TYPES` below is sent to the browser.
 */
const TYPES = [
  {
    id: 'analyst',
    label: 'Analyst report',
    blurb: 'Long-form and dense: methodology, tables, conflict analysis, confidence.',
    style:
      'Write a rigorous, long-form analyst report — the kind a professional would be comfortable circulating — in GitHub-flavoured Markdown. Style: authoritative, neutral, specific, and dense. Assume an intelligent reader who wants the substance, not the summary.',
    spec: ANALYST_SPEC,
  },
  {
    id: 'brief',
    label: 'Executive brief',
    blurb: 'One page: bottom line first, key findings, what to watch.',
    style:
      'Write a short executive brief in GitHub-flavoured Markdown. Style: terse and decision-first. Assume a busy reader who will read only this page and nothing else.',
    spec: BRIEF_SPEC,
  },
  {
    id: 'comparison',
    label: 'Comparison',
    blurb: 'Head-to-head across shared dimensions, with a scoring table.',
    style:
      'Write a head-to-head comparison of the options in this topic, in GitHub-flavoured Markdown. Style: even-handed — give each option its strongest case before judging it, and judge only on what the sources support.',
    spec: COMPARISON_SPEC,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    blurb: 'Chronology of dated events, the drivers behind them, and what is next.',
    style:
      'Write a chronological account of this topic in GitHub-flavoured Markdown. Style: precise about dates and causal order. Never invent a date, and never place an undated event on the timeline as though it were dated.',
    spec: TIMELINE_SPEC,
  },
  {
    id: 'risk',
    label: 'Risk assessment',
    blurb: 'Risk register with likelihood, impact, evidence and mitigations.',
    style:
      'Write a risk assessment in GitHub-flavoured Markdown. Style: sober and explicit about uncertainty. Separate what the sources evidence from what is merely plausible, and say which is which.',
    spec: RISK_SPEC,
  },
  {
    id: 'evidence',
    label: 'Evidence review',
    blurb: 'What is established, what is contested, and where the evidence is thin.',
    style:
      'Write an evidence review in GitHub-flavoured Markdown. Style: calibrated — the strength of the evidence is the subject of the report, not an afterthought.',
    spec: EVIDENCE_SPEC,
  },
]

export const DEFAULT_REPORT_TYPE = 'analyst'

/** Metadata safe to send to the browser — deliberately excludes prompt text. */
export const REPORT_TYPES = TYPES.map(({ id, label, blurb }) => ({ id, label, blurb }))

/** Look a type up by id, falling back to the default for unknown/absent values. */
export function resolveReportType(id) {
  return TYPES.find((type) => type.id === id) || TYPES[0]
}
