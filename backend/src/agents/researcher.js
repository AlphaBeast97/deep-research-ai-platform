import { chatJSON } from '../llm.js'
import config from '../config.js'
import { RESEARCHER_SYSTEM, researcherUser } from './prompts.js'

const CONFIDENCE = new Set(['high', 'medium', 'low'])

const asText = (value) => (typeof value === 'string' ? value.trim() : '')

const asStrings = (value) =>
  Array.isArray(value) ? value.map(asText).filter(Boolean) : []

function asCoverage(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, 0), 100)
}

function asFindings(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((f) => {
      const point = asText(f?.point ?? f?.claim)
      const cites = Array.isArray(f?.cites)
        ? [...new Set(f.cites.map((c) => Number.parseInt(c, 10)).filter(Number.isFinite))]
        : []
      const confidence = asText(f?.confidence).toLowerCase()
      return { point, cites, confidence: CONFIDENCE.has(confidence) ? confidence : 'medium' }
    })
    .filter((f) => f.point)
}

/**
 * Researcher agent — given one sub-question and the numbered sources retrieved
 * for it (some with full page text), extract grounded findings where every
 * claim carries source numbers, plus an honest coverage estimate.
 */
export async function extract(question, intent, sources) {
  const { data, usage } = await chatJSON({
    system: RESEARCHER_SYSTEM,
    user: researcherUser(question, intent, sources),
    model: config.llm.model,
    temperature: 0.2,
  })

  return {
    question,
    intent,
    summary: asText(data.summary),
    coverage: asCoverage(data.coverage),
    findings: asFindings(data.findings),
    gaps: asStrings(data.gaps),
    usage,
  }
}

/**
 * Lightweight fallback used when a sub-question turns up no sources at all —
 * avoids a pointless LLM call and keeps the pipeline moving.
 */
export function emptyExtraction(question, intent) {
  return {
    question,
    intent,
    summary: 'No sources were found for this sub-question.',
    coverage: 0,
    findings: [],
    gaps: ['Search returned no usable results for this sub-question.'],
    usage: null,
  }
}

/**
 * Should this sub-question get another search round? Triggers when nothing
 * usable was extracted, or when the researcher's own coverage estimate falls
 * below the configured floor.
 */
export function needsFollowUp(extraction, floor = config.research.coverageFloor) {
  if (!extraction) return true
  if (extraction.findings.length === 0) return true
  const coverage = extraction.coverage
  if (coverage === null || coverage === undefined) return false
  return coverage < floor
}
