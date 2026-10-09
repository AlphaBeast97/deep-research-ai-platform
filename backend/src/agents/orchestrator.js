import { randomUUID } from 'node:crypto'
import config from '../config.js'
import * as db from '../db/index.js'
import { fetchPages, webSearch } from '../services/search.js'
import * as planner from './planner.js'
import * as researcher from './researcher.js'
import * as followups from './followups.js'
import * as critic from './critic.js'
import * as writer from './writer.js'
import { auditCitations, sanitizeCitations } from './citations.js'
import {
  mockCritique,
  mockDraft,
  mockExtraction,
  mockFollowUps,
  mockPlan,
  mockRevision,
} from './mock.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0)

/**
 * Runs the full multi-agent research pipeline for one query.
 *
 * Phases, in order:
 *   plan → research (search, deep-fetch, gap-filling rounds) → draft
 *        → critique → revision → citation audit → persist
 *
 * `onEvent(event)` is invoked throughout so the caller can stream progress to
 * the client (we use it for SSE). Emitted event types:
 *   meta | phase | status | plan | step | sources | findings | token
 *   critique | report-reset | audit | done | error
 */
export async function runResearch({ query, onEvent = () => {} }) {
  const runId = randomUUID()
  const startedAt = Date.now()

  const steps = []
  const phases = []
  const sources = []
  const seenUrls = new Set()
  /** url → full page text. Run-scoped: never persisted, never sent to the client. */
  const pageTexts = new Map()
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  let currentPhase = null
  let phaseStart = Date.now()

  const emit = (event) => onEvent({ runId, ...event })

  const addUsage = (u) => {
    if (!u) return
    usage.promptTokens += u.prompt_tokens || 0
    usage.completionTokens += u.completion_tokens || 0
    usage.totalTokens += u.total_tokens || 0
  }

  const logStep = (agent, label, detail = '', status = 'done') => {
    const step = { agent, label, detail, status, at: new Date().toISOString() }
    steps.push(step)
    emit({ type: 'step', step })
  }

  const setPhase = (name) => {
    if (currentPhase) phases.push({ phase: currentPhase, ms: Date.now() - phaseStart })
    currentPhase = name
    phaseStart = Date.now()
    emit({ type: 'phase', phase: name })
  }

  const endPhase = () => {
    if (currentPhase) phases.push({ phase: currentPhase, ms: Date.now() - phaseStart })
    currentPhase = null
  }

  /** Assign a permanent citation number the first time a URL is seen. */
  const indexSource = (raw, subQuestion) => {
    if (seenUrls.has(raw.url)) return null
    seenUrls.add(raw.url)
    const source = {
      id: `s${sources.length + 1}`,
      index: sources.length + 1,
      title: raw.title,
      url: raw.url,
      snippet: raw.snippet,
      score: raw.score,
      subQuestion,
    }
    sources.push(source)
    return source
  }

  /** Tools the researcher can use beyond the initial ranked links. */
  const searchRound = async (q, sq, subSources, { followUp = false } = {}) => {
    logStep('researcher', followUp ? 'Follow-up search' : 'Searching the web', q, 'start')
    let raw = []
    try {
      raw = await webSearch(q, { maxResults: config.tavily.maxResults })
    } catch (err) {
      logStep('researcher', 'Search failed', err.message)
      return
    }
    const fresh = raw.map((r) => indexSource(r, sq.question)).filter(Boolean)
    for (const s of fresh) subSources.push(s)
    if (fresh.length) emit({ type: 'sources', sources: fresh, total: sources.length })
    logStep(
      'researcher',
      'Sources collected',
      `${fresh.length} new source${fresh.length === 1 ? '' : 's'}`,
    )
  }

  /**
   * Pull the real article text for the strongest sources of a sub-question.
   * This is what turns "a snippet mentioned it" into "the document says X".
   */
  const deepFetch = async (subSources) => {
    if (!config.research.deepFetch || config.research.deepFetchSources === 0) return 0

    const targets = subSources
      .filter((s) => !pageTexts.has(s.url))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, config.research.deepFetchSources)

    if (!targets.length) return 0

    try {
      const pages = await fetchPages(targets.map((s) => s.url))
      for (const [url, text] of pages) pageTexts.set(url, text)
      return pages.size
    } catch (err) {
      logStep('researcher', 'Page fetch failed', err.message)
      return 0
    }
  }

  const withPageText = (list) =>
    list.map((s) => (pageTexts.has(s.url) ? { ...s, content: pageTexts.get(s.url) } : s))

  /**
   * Research one sub-question, including gap-filling rounds.
   *
   * After each round the researcher reports its own coverage; if that is below
   * `COVERAGE_FLOOR`, the follow-up planner proposes genuinely new queries and
   * the loop runs again, up to `RESEARCH_MAX_ROUNDS` extra rounds.
   */
  const researchOne = async (sq, position) => {
    const subSources = []
    const asked = [sq.question]
    let round = 0
    let extraction = null

    while (round < 1 + config.research.maxRounds) {
      round++

      if (round === 1) {
        await searchRound(sq.question, sq, subSources)
      } else {
        const plan = config.mockMode
          ? mockFollowUps(sq.question, asked)
          : await followups.proposeQueries(sq.question, extraction, asked)

        if (!plan.queries.length) {
          logStep(
            'researcher',
            'Gaps not closeable by search',
            plan.reason || 'no new queries proposed',
          )
          break
        }

        logStep('researcher', 'Gap-filling round', `${plan.queries.length} new quer${plan.queries.length === 1 ? 'y' : 'ies'}`)
        for (const q of plan.queries) {
          asked.push(q)
          emit({ type: 'status', message: `Filling gaps: ${q}` })
          await searchRound(q, sq, subSources, { followUp: true })
        }
      }

      const fetched = await deepFetch(subSources)
      if (fetched) {
        logStep(
          'researcher',
          'Full pages read',
          `${fetched} page${fetched === 1 ? '' : 's'} fetched in full`,
        )
      }

      if (subSources.length === 0) {
        extraction = researcher.emptyExtraction(sq.question, sq.intent)
      } else if (config.mockMode) {
        await sleep(300)
        // First sub-question reports low coverage so the gap round is demoed.
        extraction = mockExtraction(
          sq.question,
          subSources,
          round === 1 && position === 0 ? 45 : 80,
        )
      } else {
        const res = await researcher.extract(sq.question, sq.intent, withPageText(subSources))
        addUsage(res.usage)
        extraction = res
      }

      logStep(
        'researcher',
        'Findings extracted',
        `${extraction.findings.length} finding${extraction.findings.length === 1 ? '' : 's'} · coverage ${extraction.coverage ?? '?'}/100`,
      )

      if (round >= 1 + config.research.maxRounds) break
      if (!researcher.needsFollowUp(extraction)) break

      emit({
        type: 'status',
        message: `Coverage ${extraction.coverage ?? '?'}/100 is below target — planning a deeper search…`,
      })
    }

    extraction.rounds = round
    return extraction
  }

  // ── meta ───────────────────────────────────────────────────
  emit({
    type: 'meta',
    mock: config.mockMode,
    model: config.llm.model,
    smartModel: config.llm.smartModel,
    depth: config.research.depth,
    critique: config.research.critique,
    deepFetch: config.research.deepFetch,
    maxRounds: config.research.maxRounds,
    query,
  })

  // ── 1. PLAN ────────────────────────────────────────────────
  setPhase('plan')
  emit({ type: 'status', message: 'Planning the research strategy…' })
  logStep('planner', 'Decomposing the topic', `“${query}”`, 'start')

  let plan
  if (config.mockMode) {
    await sleep(500)
    plan = mockPlan(query)
  } else {
    plan = await planner.plan(query)
    addUsage(plan.usage)
  }
  logStep('planner', 'Plan ready', `${plan.subQuestions.length} sub-questions`)
  emit({ type: 'plan', title: plan.title, scope: plan.scope, subQuestions: plan.subQuestions })

  // ── 2. RESEARCH (search → deep fetch → gap filling) ────────
  setPhase('research')
  const research = []
  for (const [position, sq] of plan.subQuestions.entries()) {
    emit({ type: 'status', message: `Researching: ${sq.question}` })
    const extraction = await researchOne(sq, position)
    research.push(extraction)
    emit({ type: 'findings', subQuestion: sq.question, extraction })
  }

  const totalRounds = research.reduce((n, r) => n + (r.rounds || 1), 0)
  const fetchedPages = pageTexts.size

  // ── 3. DRAFT (streamed) ────────────────────────────────────
  setPhase('draft')
  emit({ type: 'status', message: 'Writing the draft report…' })
  logStep(
    'writer',
    'Drafting the report',
    `${sources.length} sources · ${research.length} sub-questions · ${fetchedPages} full page(s)`,
    'start',
  )

  const draft = config.mockMode
    ? await mockDraft({ plan, research, sources, emit })
    : await writer.writeDraft({
        query,
        plan,
        research,
        sources,
        rounds: totalRounds,
        onToken: (text) => emit({ type: 'token', text }),
      })
  logStep('writer', 'Draft complete', `${wordCount(draft)} words`)

  let report = draft
  let critique = null
  let revised = false

  // ── 4. CRITIQUE + REVISE ───────────────────────────────────
  if (config.research.critique) {
    setPhase('critique')
    emit({
      type: 'status',
      message: 'Auditing the draft for uncited claims, overreach and contradictions…',
    })
    logStep('critic', 'Auditing the draft', `${sources.length} sources to check against`, 'start')

    if (config.mockMode) {
      await sleep(500)
      critique = mockCritique()
    } else {
      const res = await critic.critique({ query, research, sources, draft })
      addUsage(res.usage)
      critique = res.critique
    }

    logStep(
      'critic',
      'Critique complete',
      `${critique.issues.length} issue(s) · verdict: ${critique.verdict}${critic.hasMaterialIssues(critique) ? ' · material' : ''}`,
    )
    emit({ type: 'critique', critique })

    // The revision always runs while the critique stage is enabled — see
    // `hasMaterialIssues` for why the verdict is not used as a gate.
    setPhase('revision')
    // Tell the client the report text is about to be replaced by the revision.
    emit({ type: 'report-reset' })
    emit({
      type: 'status',
      message:
        critique.issues.length > 0
          ? `Revising the report — applying ${critique.issues.length} critique finding(s)…`
          : 'Revising the report — tightening quantification and citations…',
    })
    logStep(
      'writer',
      'Revising the report',
      critique.recommendations[0] ||
        (critique.issues.length
          ? `applying ${critique.issues.length} issue(s)`
          : 'second pass: tighten figures and citations'),
      'start',
    )

    try {
      const candidate = config.mockMode
        ? await mockRevision({ plan, research, sources, emit })
        : await writer.reviseReport({
            query,
            plan,
            research,
            sources,
            draft,
            critique,
            onToken: (text) => emit({ type: 'token', text }),
          })

      // Guard against a truncated or empty revision wiping out a good draft.
      if (candidate && wordCount(candidate) >= 120) {
        report = candidate
        revised = true
        logStep('writer', 'Revision complete', `${wordCount(report)} words`)
      } else {
        logStep('writer', 'Revision unusable', 'fell back to the draft')
        emit({
          type: 'status',
          message: 'Revision produced nothing usable — keeping the draft.',
        })
      }
    } catch (err) {
      logStep('writer', 'Revision failed', err.message)
      emit({ type: 'status', message: `Revision failed — keeping the draft (${err.message}).` })
    }
  } else {
    emit({ type: 'status', message: 'Critique pass disabled (RESEARCH_CRITIQUE=false).' })
  }

  // ── 5. CITATION AUDIT ──────────────────────────────────────
  setPhase('audit')
  const validIndexes = new Set(sources.map((s) => s.index))
  const before = auditCitations(report, sources)

  // A citation pointing at a source that does not exist would render as a dead
  // chip in the UI, so it can never survive into a stored report.
  report = sanitizeCitations(report, validIndexes)
  const audit = { ...auditCitations(report, sources), invalidRemoved: before.invalid.length }

  if (before.invalid.length) {
    logStep(
      'critic',
      'Removed unresolvable citations',
      before.invalid.map((n) => `[${n}]`).join(', '),
    )
  }
  logStep(
    'critic',
    'Citation audit',
    `${audit.references} reference(s) across ${audit.citedSourceCount}/${audit.sourceCount} source(s)`,
  )
  emit({ type: 'audit', audit })

  // ── 6. PERSIST ─────────────────────────────────────────────
  endPhase()

  const record = {
    id: runId,
    query,
    title: plan.title,
    scope: plan.scope || '',
    status: 'complete',
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    subQuestions: plan.subQuestions.map((q) => q.question),
    themes: plan.subQuestions.map((q) => q.theme || ''),
    sources,
    research,
    report,
    critique,
    audit,
    revised,
    searchRounds: totalRounds,
    phases,
    steps,
    usage,
    mock: config.mockMode,
  }

  try {
    await db.save(record)
  } catch (err) {
    emit({ type: 'status', message: `Warning: could not save report (${err.message})` })
  }

  emit({ type: 'done', record })
  return record
}
