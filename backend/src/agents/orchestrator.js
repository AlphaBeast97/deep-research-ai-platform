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
 * A run that stops or fails part-way through is still persisted, under
 * `status: "stopped"` or `"failed"`, with whatever it reached — see
 * `savePartial`. The failure is then re-thrown, so the caller's error handling
 * is unchanged.
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
export async function runResearch(options) {
  const progress = {}
  try {
    return await pipeline(options, progress)
  } catch (err) {
    // A stopped or failed run still cost money and still produced evidence the
    // user can read. Save what was reached instead of discarding it, then let
    // the caller report the failure as before.
    await savePartial(options, progress, err)
    throw err
  }
}

async function pipeline(options, progress) {
  const { query, ownerId, reportType, onEvent = () => {}, signal } = options

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

  // `savePartial` runs outside this function, so everything it needs is exposed
  // here. Arrays and the usage object are shared by reference and grow in place.
  Object.assign(progress, {
    runId,
    query,
    ownerId,
    typeId: type.id,
    startedAt,
    steps,
    phases,
    sources,
    usage,
  })

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

      // Each round's extraction is folded into what earlier rounds found rather
      // than replacing it: a second round that comes back thin, or fails, must
      // not discard findings the run already established (mergeExtractions).
      let roundExtraction
      if (subSources.length === 0) {
        roundExtraction = researcher.emptyExtraction(sq.question, sq.intent)
      } else {
        try {
          const res = await researcher.extract(sq.question, sq.intent, withPageText(subSources), {
            signal,
          })
          addUsage(res.usage)
          roundExtraction = res
        } catch (err) {
          // A stop is not a failure, and a failure must not sink the run: the
          // other sub-questions are already researched and paid for. Carry it
          // as an unanswered sub-question and keep going.
          if (stopped() || isAbortError(err)) throw err
          logStep('researcher', 'Extraction failed', err.message)
          roundExtraction = researcher.failedExtraction(sq.question, sq.intent, err.message)
        }
      }

      extraction = researcher.mergeExtractions(extraction, roundExtraction)

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
  progress.plan = plan
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
  progress.research = research
  progress.searchRounds = totalRounds

  // ── 3. DRAFT (streamed) ────────────────────────────────────
  setPhase('draft')
  emit({ type: 'status', message: 'Writing the draft report…' })
  logStep(
    'writer',
    'Drafting the report',
    `${sources.length} sources · ${research.length} sub-questions · ${fetchedPages} full page(s)`,
    'start',
  )

  // The draft is accumulated here as well as streamed: if the run is stopped or
  // fails before the revision lands, this is what the partial record keeps.
  let draftText = ''
  const draft = await writer.writeDraft({
    query,
    plan,
    research,
    sources,
    rounds: totalRounds,
    reportType: type.id,
    onToken: (text) => {
      draftText += text
      progress.draft = draftText
      emit({ type: 'token', text })
    },
    signal,
  })
  draftText = draft
  logStep('writer', 'Draft complete', `${wordCount(draft)} words`)

  let report = draft
  let critique = null
  let applicable = []
  let revised = false
  progress.draft = draftText
  progress.report = report

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
      progress.critique = critique

      // The revisor can only apply a fix the critic actually stated. Issues
      // without one stay in the record for the reader, but are not handed to
      // the revision as work to do.
      applicable = critic.actionableIssues(critique)
      logStep(
        'critic',
        'Critique complete',
        `${critique.issues.length} issue(s) · ${applicable.length} with a stated fix · verdict: ${critique.verdict}` +
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

    // Revise only when the critique names work the revisor can do: an issue
    // with a stated fix, or a citation problem. A "solid" verdict with no
    // actionable findings leaves the revisor with nothing to check against (it
    // never sees the sources), so a pass at that point can only drift or invent
    // detail — and costs a full smart-model call.
    const worthRevising =
      critique && (applicable.length > 0 || critique.citationProblems.length > 0)

    if (!worthRevising) {
      emit({
        type: 'status',
        message: critique
          ? 'Draft passed the audit — no revision needed.'
          : 'Skipping the revision: there is no critique to apply.',
      })
    } else {
      throwIfAborted(signal)
      setPhase('revision')
      // Tell the client the report text is about to be replaced by the revision.
      emit({ type: 'report-reset' })
      const citationProblems = critique.citationProblems.length
      const work = [
        applicable.length
          ? `${applicable.length} critique finding${applicable.length === 1 ? '' : 's'}`
          : null,
        citationProblems
          ? `${citationProblems} citation problem${citationProblems === 1 ? '' : 's'}`
          : null,
      ]
        .filter(Boolean)
        .join(' and ')
      emit({ type: 'status', message: `Revising the report — applying ${work}…` })
      logStep(
        'writer',
        'Revising the report',
        `applying ${work}` +
          (critique.issues.length > applicable.length
            ? ` · ${critique.issues.length - applicable.length} left to the reader (no stated fix)`
            : ''),
        'start',
      )

      try {
        const candidate = await writer.reviseReport({
          query,
          plan,
          research,
          sources,
          draft,
          // Only the issues that came with an applicable correction; the rest
          // are audit findings, not instructions (see critic.actionableIssues).
          critique: { ...critique, issues: applicable },
          reportType: type.id,
          onToken: (text) => emit({ type: 'token', text }),
          signal,
        })

        // Guard against a truncated, citation-free or structure-free revision
        // wiping out a good draft. Deliberately not a word count: a short
        // revision that removed unsupported claims is the desired outcome.
        const problem = writer.revisionRejection(draft, candidate)
        if (!problem) {
          report = candidate
          revised = true
          progress.report = report
          progress.revised = true
          logStep('writer', 'Revision complete', `${wordCount(report)} words`)
        } else {
          progress.revisionRejected = problem
          logStep('writer', 'Revision unusable', problem)
          emit({
            type: 'status',
            message: `Revision unusable (${problem}) — keeping the draft.`,
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
  progress.report = report
  progress.audit = audit

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

  const record = recordFor(progress, 'complete')

  try {
    await db.save(record)
    progress.saved = true
  } catch (err) {
    emit({ type: 'status', message: `Warning: could not save report (${err.message})` })
  }

  emit({ type: 'done', record })
  return record
}

/**
 * The stored shape, shared by a finished run and a partial one.
 *
 * Both are the same document; only `status`, `error` and how complete the
 * fields are differ. Keeping one builder is what stops a saved failure from
 * drifting into a shape the history list and the report view cannot read.
 */
export function recordFor(progress, status, extra = {}) {
  const plan = progress.plan
  return {
    id: progress.runId,
    ownerId: progress.ownerId,
    query: progress.query,
    title: plan?.title || progress.query,
    reportType: progress.typeId,
    scope: plan?.scope || '',
    status,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - (progress.startedAt || Date.now()),
    subQuestions: (plan?.subQuestions || []).map((q) => q.question),
    themes: (plan?.subQuestions || []).map((q) => q.theme || ''),
    sources: progress.sources || [],
    research: progress.research || [],
    // A revision that was never accepted must not overwrite the draft: the
    // draft is the last complete document the run produced.
    report: progress.report || progress.draft || '',
    critique: progress.critique ?? null,
    audit: progress.audit ?? null,
    revised: Boolean(progress.revised),
    revisionRejected: progress.revisionRejected ?? null,
    searchRounds: progress.searchRounds ?? 0,
    phases: progress.phases || [],
    steps: progress.steps || [],
    usage: progress.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    ...extra,
  }
}

/**
 * Persist a run that stopped or failed part-way through.
 *
 * Before this, an abort (user pressed Stop, tab closed, run deadline) threw out
 * of the pipeline before the persist phase, so minutes of searching and writing
 * vanished from history. Nothing is saved when the run never got as far as a
 * plan or a single source — there would be no report to open.
 */
async function savePartial(options, progress, err) {
  const { ownerId, reportType } = options
  // A completed run is already stored; a late throw (a failed `done` frame, say)
  // must not downgrade its record to "failed".
  if (progress.saved) return
  if (!progress.plan && !(progress.sources || []).length) return
  if (!ownerId) return

  // The stop switch is the authority on whether this was a stop: an abort reason
  // set by a caller is not necessarily named `AbortError`, and recording a
  // stopped run as a failure would misreport it in history.
  const stopped = isAbortError(err) || Boolean(options.signal?.aborted)
  const record = recordFor(progress, stopped ? 'stopped' : 'failed', {
    reportType: progress.typeId || resolveReportType(reportType).id,
    error: err.message || 'The run did not finish.',
  })

  try {
    await db.save(record)
  } catch (saveErr) {
    // The original failure is what the user needs to see; a storage problem
    // while recording it must not replace that message.
    console.error('[research] could not save the partial run:', saveErr)
  }
}
