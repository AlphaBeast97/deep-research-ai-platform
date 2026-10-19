import { chatJSON } from '../llm.js'
import config from '../config.js'
import { asText } from './normalize.js'
import { PLANNER_SYSTEM, plannerUser } from './prompts.js'

/**
 * Planner agent — turns a broad topic into a focused set of searchable
 * sub-questions, grouped by theme, plus a working title and a scope statement
 * for the report.
 */
export async function plan(query, { signal } = {}) {
  const max = config.research.maxSubQuestions
  const { data, usage } = await chatJSON({
    system: PLANNER_SYSTEM,
    // The date lets the planner scope "current state" and "outlook" questions
    // to now instead of to the model's training cutoff. UTC, so the plan does
    // not depend on the server's locale.
    user: plannerUser(query, max, new Date().toISOString().slice(0, 10)),
    model: config.llm.smartModel,
    temperature: 0.3,
    signal,
  })

  let subQuestions = Array.isArray(data.subQuestions) ? data.subQuestions : []
  subQuestions = subQuestions
    .map((q) =>
      typeof q === 'string'
        ? { question: q, intent: '', theme: '' }
        : { question: asText(q?.question), intent: asText(q?.intent), theme: asText(q?.theme) },
    )
    .filter((q) => q.question)
    .slice(0, max)

  if (subQuestions.length === 0) {
    subQuestions = [
      { question: query, intent: 'Direct investigation of the topic.', theme: '' },
    ]
  }

  return {
    title: asText(data.title) || query,
    scope: asText(data.scope),
    subQuestions,
    usage,
  }
}
