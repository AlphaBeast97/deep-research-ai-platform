import { Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import { useCallback, useEffect, useState } from 'react'
import QueryForm from './components/QueryForm.jsx'
import AgentTrace from './components/AgentTrace.jsx'
import ReportView from './components/ReportView.jsx'
import SourcesPanel from './components/SourcesPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import Badge from './components/ui/Badge.jsx'
import Button from './components/ui/Button.jsx'
import { cn } from './lib/cn.js'
import { useResearch } from './hooks/useResearch.js'
import {
  deleteReport,
  fetchHealth,
  fetchReport,
  fetchReports,
  setAuthTokenGetter,
} from './api.js'

const TABS = ['sources', 'history']

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
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const onRun = async (query) => {
    setTab('sources')
    await research.run(query)
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

  return (
    <div className="mx-auto max-w-[1320px] px-6 pt-7 pb-14">
      <header className="mb-[22px] flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-[22px] text-white shadow-lg shadow-accent/40">
            ✦
          </span>
          <div>
            <h1 className="text-[22px] tracking-tight">Deep Research</h1>
            <p className="text-[13px] text-muted">
              Multi-agent web research with cited, streamed reports
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={health?.ok ? 'ok' : 'warn'}>{health?.ok ? 'Live' : 'Offline'}</Badge>
          {health?.storage && <Badge tone="neutral">db: {health.storage}</Badge>}
          <UserButton />
        </div>
      </header>

      <QueryForm onRun={onRun} onStop={research.stop} running={running} />

      {error && (
        <div className="mb-4 rounded-control border border-danger/35 bg-danger/10 px-[15px] py-3 text-[13.5px] text-danger">
          <strong>Run failed.</strong> {error}
        </div>
      )}

      <main className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            meta={record || meta}
            running={running}
            durationMs={record?.durationMs}
            phase={phase}
            critique={critique}
            audit={audit}
          />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-5">
          <div className="flex gap-1 rounded-panel border border-line bg-surface p-1">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                className={cn(
                  'flex flex-1 items-center justify-center gap-[7px] rounded-control border-none px-3 py-2.5 text-[13px] font-semibold capitalize transition-colors',
                  tab === name ? 'bg-surface-2 text-strong' : 'bg-transparent text-muted',
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

      <footer className="mt-8 text-center text-xs tracking-wide text-muted">
        Planner → Researcher × N → Writer → Critic → Reviser · streamed live over SSE
      </footer>
    </div>
  )
}

/** Shown to signed-out visitors — Clerk's modal handles sign-in/sign-up. */
function SignedOutLanding() {
  return (
    <div className="mx-auto grid min-h-[80vh] max-w-[540px] place-items-center px-6">
      <div className="text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-[28px] text-white shadow-lg shadow-accent/40">
          ✦
        </span>
        <h1 className="mb-2 text-[26px] tracking-tight">Deep Research</h1>
        <p className="mb-6 text-[14px] text-muted">
          Ask a question and a pipeline of agents plans, searches, reads, self-critiques and
          writes a cited report. Sign in to run a question — your reports are saved to your
          account.
        </p>
        <div className="flex justify-center gap-2.5">
          <SignInButton mode="modal">
            <Button variant="primary" size="lg">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="ghost" size="lg">
              Create account
            </Button>
          </SignUpButton>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Show when="signed-out">
        <SignedOutLanding />
      </Show>
      <Show when="signed-in">
        <ResearchApp />
      </Show>
    </>
  )
}
