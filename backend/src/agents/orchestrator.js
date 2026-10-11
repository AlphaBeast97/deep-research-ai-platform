import { randomUUID } from 'node:crypto'
import config from '../config.js'
import * as db from '../db/index.js'
import { fetchPages, webSearch } from '../services/search.js'
import { mapConcurrent } from '../util/concurrency.js'
import { isAbortError, throwIfAborted } from '../llm.js'
import * as planner from './planner.js'
import * as researcher from './researcher.js'
import * as followups from './followups.js'
import * as critic from './critic.js'
import * as writer from './writer.js'
import { auditCitations, sanitizeCitations } from './citations.js'
import { SourceIndex, normalizeUrl } from './sources.js'
import { resolveReportType } from './reportTypes.js'

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
 *
 * `signal` is the caller's stop switch. Aborting it stops the run at the next
 * checkpoint and cancels the model call in flight, instead of leaving the
 * pipeline (and its API spend) running for a client that has gone away.
 */
export async function runResearch({
  query,
  ownerId,
  reportType,
  onEvent = () => {},
  signal,
}) {
  // The chosen report type drives the writer's structure and stance. Resolved
  // once here so an unknown or missing value degrades to the default instead of
  // reaching a prompt as `undefined`.
  const type = resolveReportType(reportType)
  const runId = randomUUID()
  const startedAt = Date.now()

  const steps = []
  const phases = []
  // The run's citation namespace. Numbering is global to the run and shared by
  // every sub-question, so it lives in one place (see agents/sources.js).
  const index = new SourceIndex()
  // Live view of the index — `SourceIndex` appends to this same array.
  const sources = index.list
  /** url → full page text. Run-scoped: never persisted, never sent to the client. */
  const pageTexts = new Map()
  /** True once the caller has stopped the run. */
  const stopped = () => Boolean(signal?.aborted)
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

  /**
   * One web search, folded into the run's source list.
   *
   * A sub-question receives every result the search returned for its own query —
   * including URLs the run already numbered for an earlier sub-question. Only
   * genuinely new sources are streamed to the client, so the UI's source list
   * stays free of duplicates while the researcher still gets the complete
   * evidence set for its question.
   */
  const searchRound = async (q, sq, subSources, { followUp = false } = {}) => {
    throwIfAborted(signal)
    logStep('researcher', followUp ? 'Follow-up search' : 'Searching the web', q, 'start')

    let raw = []
    try {
      raw = await webSearch(q, { maxResults: config.tavily.maxResults, signal })
    } catch (err) {
      // A stopped run is not a failed search.
      if (stopped() || isAbortError(err)) throw err
      logStep('researcher', 'Search failed', err.message)
      return
    }

    const fresh = []
    let reused = 0
    for (const result of raw) {
      const added = index.add(result, sq.question)
      if (!added) continue
      if (added.isNew) fresh.push(added.source)
      else reused++
      if (!subSources.some((s) => normalizeUrl(s.url) === normalizeUrl(added.source.url))) {
        subSources.push(added.source)
      }
    }

    if (fresh.length) emit({ type: 'sources', sources: fresh, total: sources.length })
    logStep(
      'researcher',
      'Sources collected',
      reused
        ? `${fresh.length} new · ${reused} already in the run's source list`
        : `${fresh.length} new source${fresh.length === 1 ? '' : 's'}`,
    )
  }

  /**
   * Pull the real article text for the strongest sources of a sub-question.
   * This is what turns "a snippet mentioned it" into "the document says X".
   */
  const deepFetch = async (subSources) => {
    throwIfAborted(signal)
    if (!config.research.deepFetch || config.research.deepFetchSources === 0) return 0

    const targets = subSources
      .filter((s) => !pageTexts.has(s.url))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, config.research.deepFetchSources)

    if (!targets.length) return 0

    try {
      const pages = await fetchPages(targets.map((s) => s.url), { signal })
      for (const [url, text] of pages) pageTexts.set(url, text)
      return pages.size
    } catch (err) {
      if (stopped() || isAbortError(err)) throw err
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
  const researchOne = async (sq) => {
    const subSources = []
    const asked = [sq.question]
    let round = 0
    let extraction = null

    while (round < 1 + config.research.maxRounds) {
      round++
      throwIfAborted(signal)

      if (round === 1) {
        await searchRound(sq.question, sq, subSources)
      } else {
        const plan = await followups.proposeQueries(sq.question, extraction, asked, { signal })

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
      } else {
        try {
          const res = await researcher.extract(sq.question, sq.intent, withPageText(subSources), {
            signal,
          })
          addUsage(res.usage)
          extraction = res
        } catch (err) {
          // A stop is not a failure, and a failure must not sink the run: the
          // other sub-questions are already researched and paid for. Carry it
          // as an unanswered sub-question and keep going.
          if (stopped() || isAbortError(err)) throw err
          logStep('researcher', 'Extraction failed', err.message)
          extraction = researcher.failedExtraction(sq.question, sq.intent, err.message)
        }
      }

      logStep(
        'researcher',
        'Findings extracted',
        `${extraction.findings.length} finding${extraction.findings.length === 1 ? '' : 's'} · coverage ${extraction.coverage ?? '?'}/100` +
          (extraction.droppedFindings
            ? ` · ${extraction.droppedFindings} uncited claim(s) discarded`
            : ''),
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
    model: config.llm.model,
    smartModel: config.llm.smartModel,
    depth: config.research.depth,
    critique: config.research.critique,
    deepFetch: config.research.deepFetch,
    maxRounds: config.research.maxRounds,
    reportType: type.id,
    query,
  })

  // ── 1. PLAN ────────────────────────────────────────────────
  setPhase('plan')
  emit({ type: 'status', message: 'Planning the research strategy…' })
  logStep('planner', 'Decomposing the topic', `“${query}”`, 'start')

  const plan = await planner.plan(query, { signal })
  addUsage(plan.usage)
  logStep('planner', 'Plan ready', `${plan.subQuestions.length} sub-questions`)
  emit({ type: 'plan', title: plan.title, scope: plan.scope, subQuestions: plan.subQuestions })

  // ── 2. RESEARCH (search → deep fetch → gap filling) ────────
  setPhase('research')
  // The sub-questions are independent, so they are researched concurrently up
  // to RESEARCH_CONCURRENCY (the wall-clock win of the whole pipeline: this
  // phase is almost entirely network wait). Results stay in plan order, which
  // is the order the writer expects.
  const research = await mapConcurrent(
    plan.subQuestions,
    config.research.concurrency,
    async (sq) => {
      throwIfAborted(signal)
      emit({ type: 'status', message: `Researching: ${sq.question}` })
      const extraction = await researchOne(sq)
      emit({ type: 'findings', subQuestion: sq.question, extraction })
      return extraction
    },
  )

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

  const draft = await writer.writeDraft({
    query,
    plan,
    research,
    sources,
    rounds: totalRounds,
    reportType: type.id,
    onToken: (text) => emit({ type: 'token', text }),
    signal,
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

    // The critic is given the same evidence the researcher worked from — full
    // page text for the sources the draft actually cites — so it can tell "not
    // in the snippet" apart from "not in the source" when judging overreach and
    // miscitation. It is also told which deliverable was requested, so the
    // STRUCTURE check has a specification to check against.
    //
    // The critique is the *last* thing to happen to a draft that took minutes to
    // research and write, so a provider error here degrades the run rather than
    // ending it: the report is still citation-audited and persisted, just
    // unrevised. Only a stop is allowed to propagate.
    try {
      const res = await critic.critique({
        query,
        research,
        sources: withPageText(sources),
        draft,
        reportType: type.id,
        signal,
      })
      addUsage(res.usage)
      critique = res.critique

      logStep(
        'critic',
        'Critique complete',
        `${critique.issues.length} issue(s) · verdict: ${critique.verdict}` +
          `${critic.hasMaterialIssues(critique) ? ' · material' : ''}` +
          `${res.fullTextSources ? ` · ${res.fullTextSources} source(s) read in full` : ''}`,
      )
      emit({ type: 'critique', critique })
    } catch (err) {
      if (stopped() || isAbortError(err)) throw err
      logStep('critic', 'Critique failed', err.message)
      emit({
        type: 'status',
        message: `The critique pass failed (${err.message}) — the report is unrevised.`,
      })
    }

    if (!critique) {
      emit({ type: 'status', message: 'Skipping the revision: there is no critique to apply.' })
    } else {
      // The revision always runs while the critique stage is enabled — see
      // `hasMaterialIssues` for why the verdict is not used as a gate.
      throwIfAborted(signal)
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
        const candidate = await writer.reviseReport({
          query,
          plan,
          research,
          sources,
          draft,
          critique,
          reportType: type.id,
          onToken: (text) => emit({ type: 'token', text }),
          signal,
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
        if (stopped() || isAbortError(err)) throw err
        logStep('writer', 'Revision failed', err.message)
        emit({ type: 'status', message: `Revision failed — keeping the draft (${err.message}).` })
      }
    }
  } else {
    emit({ type: 'status', message: 'Critique pass disabled (RESEARCH_CRITIQUE=false).' })
  }

  // ── 5. CITATION AUDIT ──────────────────────────────────────
  throwIfAborted(signal)
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
    ownerId,
    query,
    title: plan.title,
    reportType: type.id,
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
  }

  try {
    await db.save(record)
  } catch (err) {
    emit({ type: 'status', message: `Warning: could not save report (${err.message})` })
  }

  emit({ type: 'done', record })
  return record
}
