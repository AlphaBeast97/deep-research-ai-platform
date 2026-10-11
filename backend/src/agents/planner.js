import { chatJSON } from '../llm.js'
import config from '../config.js'
import { asText } from './normalize.js'
import { PLANNER_SYSTEM, plannerUser } from './prompts.js'

/**
 * Planner agent — turns a broad topic into a focused set of searchable
 * sub-questions, grouped by theme, plus a working title and a scope statement
 * for the report.
 */
export async function plan(query) {
  const max = config.research.maxSubQuestions
  const { data, usage } = await chatJSON({
    system: PLANNER_SYSTEM,
    user: plannerUser(query, max),
    model: config.llm.smartModel,
    temperature: 0.3,
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
