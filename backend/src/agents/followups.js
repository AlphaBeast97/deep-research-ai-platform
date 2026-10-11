import { chatJSON } from '../llm.js'
import config from '../config.js'
import { asText } from './normalize.js'
import { FOLLOWUP_SYSTEM, followUpUser } from './prompts.js'

/**
 * Gap-filling planner — the researcher's second tool.
 *
 * When a sub-question comes back with thin findings, this asks the model to
 * propose *new* search queries that target the specific gaps, rather than
 * re-running a rephrased version of the original question.
 *
 * Returns `{ queries, reason, usage }`; `queries` is empty when more searching
 * would not help (e.g. the information is not public), which is what stops the
 * loop from burning rounds on an unanswerable sub-question.
 */
export async function proposeQueries(question, extraction, alreadyAsked = [], { signal } = {}) {
  const max = config.research.maxFollowUpQueries
  if (max === 0) return { queries: [], reason: 'follow-up queries disabled', usage: null }

  const { data, usage } = await chatJSON({
    system: FOLLOWUP_SYSTEM,
    user: followUpUser(question, extraction, alreadyAsked, max),
    model: config.llm.model,
    temperature: 0.4,
    signal,
  })

  const asked = new Set(alreadyAsked.map((q) => q.toLowerCase().trim()))
  const queries = (Array.isArray(data.queries) ? data.queries : [])
    .map(asText)
    .filter((q) => q && !asked.has(q.toLowerCase()))
    .slice(0, max)

  return { queries, reason: asText(data.reason), usage }
}
