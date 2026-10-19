import { useCallback, useRef, useState } from 'react'
import { streamResearch } from '../api.js'

const initialState = {
  status: 'idle', // idle | running | done | error
  phase: null, // plan | research | draft | critique | revision | audit
  statusMessage: '',
  meta: null,
  plan: null,
  steps: [],
  sources: [],
  findings: [],
  report: '',
  critique: null,
  audit: null,
  record: null,
  error: null,
  // True when the user stopped the run: what is on screen is a partial result
  // with no critique or citation audit, and the UI says so instead of passing
  // it off as a finished report.
  stopped: false,
}

/**
 * Owns the lifecycle of a single research run: fires the request, folds every
 * streamed event into state, and exposes abort/load helpers.
 *
 * The pipeline has two streamed text phases (draft, then revision). The
 * `report-reset` event is the hinge between them — it clears the buffer so the
 * revision streams into an empty report instead of being appended to the draft.
 */
export function useResearch() {
  const [state, setState] = useState(initialState)
  const abortRef = useRef(null)

  const reset = useCallback(() => setState(initialState), [])

  /**
   * Stop the run by aborting the request; `run`'s AbortError branch settles the
   * state and sets `stopped`.
   *
   * Deliberately not setting `status: 'done'` here. That flipped the control to
   * its "Research" state before the browser finished activating the click, and
   * the form then submitted with the old query — one press of Stop aborted the
   * run and immediately started a replacement. Waiting for the abort to settle
   * also means a second click still lands on Stop (a no-op) instead of starting
   * a run.
   */
  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const loadRecord = useCallback((record) => {
    // A stored run that was stopped or failed is reopened as what it is: the
    // report view warns that the critique and citation audit never ran, instead
    // of presenting a partial draft as a finished report.
    const partial = record.status === 'stopped' || record.status === 'failed'
    setState({
      status: 'done',
      phase: null,
      statusMessage: '',
      meta: null,
      plan: {
        title: record.title,
        scope: record.scope,
        subQuestions: (record.subQuestions ?? []).map((q) => ({ question: q })),
      },
      steps: record.steps ?? [],
      sources: record.sources ?? [],
      findings: record.research ?? [],
      report: record.report ?? '',
      critique: record.critique ?? null,
      audit: record.audit ?? null,
      record,
      error: null,
      stopped: partial,
    })
  }, [])

  const run = useCallback(
    async (query, reportType) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ ...initialState, status: 'running', statusMessage: 'Starting…' })

      const apply = (event) =>
        setState((s) => {
          switch (event.type) {
            case 'meta':
              return { ...s, meta: event, statusMessage: 'Planning the research strategy…' }
            case 'phase':
              return { ...s, phase: event.phase }
            case 'status':
              return { ...s, statusMessage: event.message }
            case 'step':
              return { ...s, steps: [...s.steps, event.step] }
            case 'plan':
              return {
                ...s,
                plan: {
                  title: event.title,
                  scope: event.scope,
                  subQuestions: event.subQuestions,
                },
              }
            case 'sources':
              return { ...s, sources: [...s.sources, ...event.sources] }
            case 'findings':
              return { ...s, findings: [...s.findings, event.extraction] }
            case 'critique':
              return { ...s, critique: event.critique }
            case 'report-reset':
              // The revision replaces the draft rather than extending it.
              return { ...s, report: '' }
            case 'token':
              return { ...s, report: s.report + event.text }
            case 'audit':
              return { ...s, audit: event.audit }
            case 'done':
              return {
                ...s,
                status: 'done',
                phase: null,
                statusMessage: '',
                record: event.record,
                report: event.record.report || s.report,
                critique: event.record.critique ?? s.critique,
                audit: event.record.audit ?? s.audit,
              }
            case 'error':
              return { ...s, status: 'error', error: event.message }
            default:
              return s
          }
        })

      try {
        await streamResearch(query, { reportType, onEvent: apply, signal: controller.signal })
        setState((s) =>
          s.status === 'running'
            ? {
                ...s,
                status: s.report ? 'done' : 'error',
                error: s.report ? null : 'The run ended without a report.',
              }
            : s,
        )
      } catch (err) {
        if (err.name === 'AbortError') {
          // The user stopped it (the backend aborts the run for the same reason).
          setState((s) => ({ ...s, status: 'done', phase: null, statusMessage: '', stopped: true }))
          return
        }
        setState((s) => ({ ...s, status: 'error', error: err.message }))
      } finally {
        abortRef.current = null
      }
    },
    [],
  )

  return { ...state, run, stop, reset, loadRecord }
}
