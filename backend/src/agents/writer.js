import { chatStream } from '../llm.js'
import config from '../config.js'
import { REVISER_SYSTEM, WRITER_SYSTEM, reviserUser, writerUser } from './prompts.js'

/**
 * Writer agent — synthesizes all researcher output into one streamed report.
 * Tokens are pushed through `onToken` so the UI renders the report live.
 */
export async function writeDraft({ query, plan, research, sources, rounds, onToken }) {
  return chatStream({
    system: WRITER_SYSTEM,
    user: writerUser(query, plan, research, sources, rounds),
    model: config.llm.smartModel,
    temperature: 0.5,
    onToken,
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
  onToken,
}) {
  return chatStream({
    system: REVISER_SYSTEM,
    user: reviserUser(query, plan, research, sources, draft, critique),
    model: config.llm.smartModel,
    temperature: 0.35,
    onToken,
  })
}
