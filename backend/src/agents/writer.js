import { chatStream } from '../llm.js'
import config from '../config.js'
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
