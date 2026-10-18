import { useRef, useState } from 'react'
import Markdown from './Markdown.jsx'
import Panel, { PanelHead } from './ui/Panel.jsx'
import Button from './ui/Button.jsx'
import Badge from './ui/Badge.jsx'
import Mark from './ui/Mark.jsx'
import FadeBox from './ui/FadeBox.jsx'
import StatusPill from './ui/StatusPill.jsx'
import { formatDate, formatDuration, formatNumber, wordCount } from '../lib/format.js'
import { downloadMarkdown, printReport } from '../lib/export.js'
import { downloadDocx, rasterizeDiagrams } from '../lib/docx.js'

const PHASE_LABEL = {
  plan: 'Planning the research strategy…',
  research: 'Searching, reading pages and filling gaps…',
  draft: 'Writing the draft report…',
  critique: 'Auditing the draft for uncited claims and overreach…',
  revision: 'Revising the report with the critique applied…',
  audit: 'Verifying every citation resolves…',
}

// The stored `phases[]` timings, coloured by the agent that owns each phase.
const PHASE_DOT = {
  plan: 'bg-planner',
  research: 'bg-researcher',
  draft: 'bg-writer',
  critique: 'bg-critic',
  revision: 'bg-writer',
  audit: 'bg-ok',
}
const PHASE_NAME = {
  plan: 'Plan',
  research: 'Research',
  draft: 'Draft',
  critique: 'Critique',
  revision: 'Revision',
  audit: 'Audit',
}

export default function ReportView({
  report,
  title,
  running,
  durationMs,
  phase,
  activity,
  critique,
  audit,
  sources = [],
  typeLabel,
  stopped = false,
  record,
}) {
  const containerRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  // null = follow the run: expanded while it streams, a faded preview once it
  // is done. A click pins it either way, so the reader can collapse the report
  // even while it is still being written.
  const [expandedByUser, setExpandedByUser] = useState(null)

  const words = wordCount(report)

  // Run metadata. It exists on a stored record — after `done`, or loaded from
  // history — and is absent while a run is still streaming, which is why every
  // part of this block is conditional.
  const usage = record?.usage
  const phases = (Array.isArray(record?.phases) ? record.phases : []).filter(
    (entry) => Number(entry?.ms) > 0,
  )
  const phaseTotal = phases.reduce((sum, entry) => sum + Number(entry.ms), 0)
  const durationLabel = formatDuration(durationMs)

  const runFacts = []
  if (Number(usage?.totalTokens) > 0) {
    runFacts.push(
      `${formatNumber(usage.totalTokens)} tokens (${formatNumber(usage.promptTokens)} in / ${formatNumber(usage.completionTokens)} out)`,
    )
  }
  if (Number(record?.searchRounds) > 0) {
    const rounds = Number(record.searchRounds)
    runFacts.push(`${rounds} search round${rounds === 1 ? '' : 's'}`)
  }
  if (record?.revised) runFacts.push('revised')
  const runDate = formatDate(record?.createdAt)
  if (runDate) runFacts.push(runDate)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — nothing we can do silently */
    }
  }

  const onExportMarkdown = () => downloadMarkdown({ title, report, sources })

  // `report` goes to both exporters as well as `sources`: the Sources appendix
  // they write lists only the sources the report cites, and the report text is
  // what decides that (see `citedSources`). The in-app panel still lists every
  // source the run found, dimming the unused ones — there it answers "what was
  // searched", which is a different question.
  const onExportPdf = () =>
    printReport({ title, html: containerRef.current?.innerHTML ?? '', report, sources })

  const onExportDocx = async () => {
    if (exporting) return
    setExporting(true)
    try {
      // Rasterise the rendered diagrams first so they land in the .docx as
      // images rather than Mermaid source text.
      const diagramImages = await rasterizeDiagrams(containerRef.current)
      await downloadDocx({ title, report, sources, diagramImages })
    } catch (err) {
      console.error('DOCX export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  if (!report) {
    return (
      <Panel className="grid min-h-[340px] place-items-center">
        <div className="mx-auto max-w-[520px] text-center">
          {running ? (
            <>
              <StatusPill label={activity} />
              <p className="mt-4 text-[13.5px] leading-[1.6] text-muted">
                {PHASE_LABEL[phase] ?? 'Planning, searching and reading whole pages.'}
              </p>
            </>
          ) : stopped ? (
            <>
              <Mark className="mx-auto h-12 w-12" />
              <h2 className="mt-4 font-display text-[21px] tracking-tight text-strong">
                This run ended before a report was written
              </h2>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted">
                {record?.error || 'The run stopped during research.'} The sources and steps it
                reached are kept in the trace above.
              </p>
            </>
          ) : (
            <>
              <Mark className="mx-auto h-12 w-12" />
              <h2 className="mt-4 font-display text-[21px] tracking-tight text-strong">
                Your report will appear here
              </h2>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted">
                Ask a question above and the agent pipeline will plan, research, self-critique, and
                write a cited report.
              </p>
            </>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel className="rise">
      <PanelHead title="Report" className="items-start">
        <div className="flex gap-1.5">
          <Button size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" onClick={onExportMarkdown}>
            .md
          </Button>
          <Button size="sm" onClick={onExportPdf}>
            PDF
          </Button>
          <Button size="sm" onClick={onExportDocx} disabled={exporting}>
            {exporting ? 'Preparing…' : 'DOCX'}
          </Button>
        </div>
      </PanelHead>

      <p className="text-[12.5px] text-muted">
        {formatNumber(words)} words
        {durationLabel ? ` · ${durationLabel}` : ''}
        {typeLabel ? ` · ${typeLabel}` : ''}
      </p>

      {runFacts.length > 0 && (
        <p className="mt-1 text-[12.5px] text-muted">{runFacts.join(' · ')}</p>
      )}

      {phaseTotal > 0 && (
        <div className="mt-2.5">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label="Time spent in each phase"
          >
            {phases.map((entry) => (
              <span
                key={entry.phase}
                className={`${PHASE_DOT[entry.phase] ?? 'bg-muted'} border-r-2 border-surface last:border-r-0`}
                style={{ width: `${(Number(entry.ms) / phaseTotal) * 100}%`, minWidth: 6 }}
                title={`${PHASE_NAME[entry.phase] ?? entry.phase} · ${formatDuration(entry.ms)}`}
              />
            ))}
          </div>
          <ul className="mt-1.5 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[11.5px] text-muted">
            {phases.map((entry) => (
              <li key={entry.phase} className="inline-flex items-center gap-1.5">
                <span
                  className={`h-[6px] w-[6px] flex-none rounded-full ${PHASE_DOT[entry.phase] ?? 'bg-muted'}`}
                  aria-hidden="true"
                />
                {PHASE_NAME[entry.phase] ?? entry.phase}
                <span className="text-muted/80">{formatDuration(entry.ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A stopped run leaves a partial draft with no critique and no citation
          audit — say so, rather than presenting it as a finished report. */}
      {stopped && (
        <div className="mt-3 rounded-control border border-warn/35 bg-warn/10 px-3.5 py-2.5 text-[12.5px] text-warn">
          <strong>{record?.status === 'failed' ? 'Run failed.' : 'Stopped early.'}</strong>{' '}
          {record?.error ? `${record.error} ` : ''}The critique and citation audit never ran, so
          nothing below has been verified against its sources yet.
        </div>
      )}

      {/* ── integrity summary ───────────────────────────────── */}
      {(audit || critique) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {audit && (
            <Badge tone="neutral">
              {audit.references} citation{audit.references === 1 ? '' : 's'}
            </Badge>
          )}
          {audit && (
            <Badge tone="neutral">
              {audit.citedSourceCount}/{audit.sourceCount} sources cited
            </Badge>
          )}
          {audit?.uncited?.length > 0 && <Badge tone="warn">{audit.uncited.length} uncited</Badge>}
          {audit?.invalidRemoved > 0 && (
            <Badge tone="danger">{audit.invalidRemoved} broken citation removed</Badge>
          )}
          {critique && (
            <Badge tone={critique.verdict === 'solid' ? 'ok' : 'warn'}>
              {critique.verdict === 'solid'
                ? 'critique: clean'
                : `critique: ${critique.issues.length} issue${critique.issues.length === 1 ? '' : 's'}`}
            </Badge>
          )}
        </div>
      )}

      {critique?.issues?.length > 0 && (
        <details className="mt-3.5 rounded-control border border-line bg-inset px-3.5 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-strong transition-colors select-none hover:text-accent">
            Self-critique · {critique.issues.length} issue
            {critique.issues.length === 1 ? '' : 's'} found before the revision
          </summary>
          <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
            {critique.issues.map((issue, i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <span className="text-[11px] font-semibold tracking-wide text-warn">
                  {issue.severity} · {issue.type}
                </span>
                <p className="mt-0.5 text-[12.5px] text-fg">{issue.problem}</p>
                {issue.claim && (
                  <p className="mt-0.5 text-[12px] text-muted italic">“{issue.claim}”</p>
                )}
                {issue.fix && <p className="mt-0.5 text-[12px] text-muted">Fix: {issue.fix}</p>}
              </li>
            ))}
          </ul>
          {critique.recommendations?.length > 0 && (
            <div className="mt-3 border-t border-line-soft pt-2.5">
              <span className="text-[11px] font-semibold tracking-wide text-muted">
                Revision instructions
              </span>
              <ul className="mt-1 list-disc pl-4 text-[12.5px] text-muted">
                {critique.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}

      <FadeBox
        className="mt-5"
        collapsedHeight={460}
        expanded={expandedByUser ?? running}
        animate={!running}
        onToggle={() => setExpandedByUser(!(expandedByUser ?? running))}
        label="Read the full report"
      >
        <article ref={containerRef}>
          <Markdown>{report}</Markdown>
        </article>
      </FadeBox>
    </Panel>
  )
}
