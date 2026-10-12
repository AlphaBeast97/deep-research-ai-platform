import { Show, UserButton, useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import Landing from './components/Landing.jsx'
import QueryForm from './components/QueryForm.jsx'
import AgentTrace from './components/AgentTrace.jsx'
import ReportView from './components/ReportView.jsx'
import SourcesPanel from './components/SourcesPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import Badge from './components/ui/Badge.jsx'
import Mark from './components/ui/Mark.jsx'
import { cn } from './lib/cn.js'
import { useResearch } from './hooks/useResearch.js'
import {
  deleteReport,
  fetchHealth,
  fetchReport,
  fetchReportTypes,
  fetchReports,
  setAuthTokenGetter,
} from './api.js'

const TABS = ['sources', 'history']

/** Agent ids as they appear in a step, for the status pill's label. */
const AGENT_NAME = {
  planner: 'Planner',
  researcher: 'Researcher',
  writer: 'Writer',
  critic: 'Critic',
}

/** The signed-in application: a research run, its trace, report and library. */
function ResearchApp() {
  const { getToken } = useAuth()
  const research = useResearch()
  const { status, phase, steps, plan, sources, report, record, meta, critique, audit, error } =
    research
  const running = status === 'running'

  const [health, setHealth] = useState(null)
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('sources')
  const [reportTypes, setReportTypes] = useState([])
  const [reportType, setReportType] = useState('')

  // Hand the API layer a fresh session token for every request.
  useEffect(() => {
    setAuthTokenGetter(getToken)
    return () => setAuthTokenGetter(null)
  }, [getToken])

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await fetchReports())
    } catch {
      /* history is non-critical */
    }
  }, [])

  // One-time sync with the backend on mount.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const h = await fetchHealth()
        if (!cancelled) setHealth(h)
      } catch {
        if (!cancelled) setHealth({ ok: false })
      }
      try {
        const reports = await fetchReports()
        if (!cancelled) setHistory(reports)
      } catch {
        /* history is non-critical */
      }
      try {
        const types = await fetchReportTypes()
        if (!cancelled && types.length) {
          setReportTypes(types)
          // Default to the first (the long-form analyst report).
          setReportType((current) => current || types[0].id)
        }
      } catch {
        /* format list is non-critical — the backend applies its own default */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const onRun = async (query) => {
    setTab('sources')
    await research.run(query, reportType)
    refreshHistory()
  }

  const onOpen = async (id) => {
    try {
      research.loadRecord(await fetchReport(id))
      setTab('sources')
    } catch (err) {
      console.error(err)
    }
  }

  const onDelete = async (id) => {
    await deleteReport(id)
    refreshHistory()
  }

  const hasRun = steps.length > 0 || Boolean(report)

  // Prefer the stored record's type, then the in-flight meta event, then the
  // current selection — so the label is right while running and after reload.
  const activeTypeId = record?.reportType || meta?.reportType || reportType
  const activeTypeLabel = reportTypes.find((t) => t.id === activeTypeId)?.label

  // Names the step the agents are on right now, for the status pill.
  const lastStep = steps[steps.length - 1]
  const activity = lastStep
    ? `${AGENT_NAME[lastStep.agent] ?? lastStep.agent} · ${lastStep.label}`
    : null

  return (
    <div className="mx-auto max-w-[1320px] px-5 pt-6 pb-16 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mark className="h-10 w-10" />
          <div>
            <h1 className="font-display text-[22px] leading-none tracking-tight text-strong">
              MAD Researcher
            </h1>
            <p className="mt-1.5 text-[13px] text-muted">
              Multi-agent web research with cited, streamed reports
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={health?.ok ? 'ok' : 'warn'}>{health?.ok ? 'Live' : 'Offline'}</Badge>
          {health?.storage && <Badge tone="neutral">{health.storage}</Badge>}
          <UserButton />
        </div>
      </header>

      <QueryForm
        onRun={onRun}
        onStop={research.stop}
        running={running}
        reportTypes={reportTypes}
        reportType={reportType}
        onReportTypeChange={setReportType}
      />

      {error && (
        <div className="mb-4 rounded-control border border-danger/35 bg-danger/10 px-4 py-3 text-[13.5px] text-danger">
          <strong>Run failed.</strong> {error}
        </div>
      )}

      <main className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {hasRun && (
            <AgentTrace
              steps={steps}
              plan={plan}
              statusMessage={research.statusMessage}
              phase={phase}
              running={running}
            />
          )}
          <ReportView
            report={report}
            title={record?.title || plan?.title || 'Research report'}
            running={running}
            durationMs={record?.durationMs}
            phase={phase}
            activity={activity}
            critique={critique}
            audit={audit}
            sources={sources}
            typeLabel={activeTypeLabel}
            stopped={research.stopped}
          />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-5">
          <div className="flex gap-1 rounded-panel border border-line bg-surface p-1">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-control border-none px-3 py-2.5 text-[13px] font-semibold capitalize transition-colors',
                  tab === name ? 'bg-surface-2 text-strong' : 'bg-transparent text-muted hover:bg-surface-2 hover:text-strong',
                )}
                onClick={() => setTab(name)}
              >
                {name}
                {name === 'sources' && sources.length > 0 && (
                  <Badge tone="accent">{sources.length}</Badge>
                )}
                {name === 'history' && history.length > 0 && (
                  <Badge tone="accent">{history.length}</Badge>
                )}
              </button>
            ))}
          </div>

          {tab === 'sources' ? (
            <SourcesPanel sources={sources} uncited={audit?.uncited} />
          ) : (
            <HistoryPanel
              reports={history}
              onOpen={onOpen}
              onDelete={onDelete}
              activeId={record?.id}
            />
          )}
        </aside>
      </main>

      <footer className="mt-10 text-center text-[12.5px] tracking-wide text-muted">
        MAD Researcher · Planner → Researcher × N → Writer → Critic → Reviser · streamed live over
        SSE
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Show when="signed-out">
        <Landing />
      </Show>
      <Show when="signed-in">
        <ResearchApp />
      </Show>
    </>
  )
}
