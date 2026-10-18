import { chatJSON } from '../llm.js'
import config from '../config.js'
import { asStrings, asText } from './normalize.js'
import { RESEARCHER_SYSTEM, researcherUser } from './prompts.js'

const CONFIDENCE = new Set(['high', 'medium', 'low'])

function asCoverage(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, 0), 100)
}

/**
 * Normalise the model's findings and drop anything that is not grounded.
 *
 * `cites` arrives in whatever shape the model felt like: an array of numbers,
 * an array of strings, or one comma-separated string. It is also the model's
 * word alone that the numbers refer to sources it was actually given, so every
 * citation is checked against the indexes of *this* sub-question's source list.
 * A finding whose citations all fall outside that list is, by the system's own
 * contract, unsupported — keeping it would feed the writer a claim with an
 * empty `[]` citation and invite exactly the uncited assertions the audit then
 * flags. Those are dropped and counted instead.
 */
export function parseFindings(value, validIndexes) {
  const valid = validIndexes ? new Set(validIndexes) : null
  const raw = Array.isArray(value) ? value : []

  let dropped = 0
  const findings = []

  for (const f of raw) {
    const point = asText(f?.point ?? f?.claim)
    if (!point) continue

    const cites = Array.isArray(f?.cites)
      ? f.cites
      : typeof f?.cites === 'string'
        ? f.cites.split(/[,\s]+/)
        : []

    const numbers = [
      ...new Set(cites.map((c) => Number.parseInt(c, 10)).filter(Number.isFinite)),
    ].filter((n) => !valid || valid.has(n))

    if (!numbers.length) {
      dropped++
      continue
    }

    const confidence = asText(f?.confidence).toLowerCase()
    findings.push({ point, cites: numbers, confidence: CONFIDENCE.has(confidence) ? confidence : 'medium' })
  }

  return { findings, dropped }
}

/**
 * Researcher agent — given one sub-question and the numbered sources retrieved
 * for it (some with full page text), extract grounded findings where every
 * claim carries source numbers, plus an honest coverage estimate.
 */
export async function extract(question, intent, sources, { signal } = {}) {
  const { data, usage } = await chatJSON({
    system: RESEARCHER_SYSTEM,
    user: researcherUser(question, intent, sources),
    model: config.llm.model,
    temperature: 0.2,
    signal,
  })

  const { findings, dropped } = parseFindings(
    data.findings,
    sources.map((s) => s.index),
  )

  return {
    question,
    intent,
    summary: asText(data.summary),
    coverage: asCoverage(data.coverage),
    findings,
    droppedFindings: dropped,
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
    droppedFindings: 0,
    gaps: ['Search returned no usable results for this sub-question.'],
    usage: null,
  }
}

/**
 * A degraded extraction for a sub-question whose extraction call failed.
 *
 * One flaky model response must not cost the whole run: the other
 * sub-questions have already been researched, and the orchestrator would
 * otherwise throw away minutes of search and page reads. The failure is carried
 * in `gaps` so it reaches the report's limitations rather than disappearing.
 */
export function failedExtraction(question, intent, reason) {
  return {
    question,
    intent,
    summary: 'Findings could not be extracted for this sub-question.',
    coverage: 0,
    findings: [],
    droppedFindings: 0,
    gaps: [`Extraction failed (${reason}) — this sub-question is unanswered.`],
    usage: null,
  }
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 }

/** Claim identity for deduplication: case- and punctuation-insensitive text. */
const claimKey = (point) =>
  String(point || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Fold a later round's extraction into what earlier rounds already found.
 *
 * A gap-filling round used to *replace* the previous extraction, so a second
 * round that came back thin (or failed outright) silently threw away findings
 * the run had already paid to establish. The merge keeps every grounded claim:
 *
 * - findings are unioned by claim text, and a repeated claim keeps the union of
 *   its citations and its strongest confidence;
 * - `coverage` takes the better of the two estimates — gathering more sources
 *   cannot make a sub-question less covered, and a later round that found
 *   nothing must not reset the measure that decides whether to keep searching;
 * - `gaps` is unioned, because a gap recorded in either round is still open;
 * - the summary only moves forward when the later round actually produced
 *   findings, so "no sources were found" never overwrites a real synthesis.
 */
export function mergeExtractions(previous, next) {
  if (!previous) return next
  if (!next) return previous

  const findings = (previous.findings || []).map((f) => ({ ...f, cites: [...(f.cites || [])] }))
  const byKey = new Map(findings.map((f) => [claimKey(f.point), f]))

  for (const finding of next.findings || []) {
    const key = claimKey(finding.point)
    const known = byKey.get(key)
    if (!known) {
      const copy = { ...finding, cites: [...(finding.cites || [])] }
      findings.push(copy)
      byKey.set(key, copy)
      continue
    }
    known.cites = [...new Set([...known.cites, ...(finding.cites || [])])].sort((a, b) => a - b)
    if (CONFIDENCE_RANK[finding.confidence] > CONFIDENCE_RANK[known.confidence]) {
      known.confidence = finding.confidence
    }
  }

  const gaps = []
  for (const gap of [...(previous.gaps || []), ...(next.gaps || [])]) {
    if (gap && !gaps.includes(gap)) gaps.push(gap)
  }

  return {
    ...previous,
    summary: next.findings?.length && next.summary ? next.summary : previous.summary,
    coverage:
      previous.coverage === null || previous.coverage === undefined
        ? next.coverage
        : Math.max(previous.coverage, next.coverage ?? 0),
    findings,
    droppedFindings: (previous.droppedFindings || 0) + (next.droppedFindings || 0),
    gaps,
    rounds: Math.max(previous.rounds || 1, next.rounds || 1),
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
