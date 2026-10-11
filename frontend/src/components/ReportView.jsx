import { useRef, useState } from 'react'
import Markdown from './Markdown.jsx'
import Panel, { PanelHead } from './ui/Panel.jsx'
import Button from './ui/Button.jsx'
import Badge from './ui/Badge.jsx'
import { wordCount } from '../lib/format.js'
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

export default function ReportView({
  report,
  title,
  running,
  durationMs,
  phase,
  critique,
  audit,
  sources = [],
  typeLabel,
  stopped = false,
}) {
  const containerRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  const words = wordCount(report)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — nothing we can do silently */
    }
  }

  const onExportMarkdown = () => downloadMarkdown({ title, report })

  const onExportPdf = () =>
    printReport({ title, html: containerRef.current?.innerHTML ?? '', sources })

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
      <Panel className="grid min-h-[380px] place-items-center">
        <div className="max-w-[420px] text-center text-muted">
          <div className="mb-3 text-[34px] text-accent">✦</div>
          <h2 className="mb-1.5 text-[17px]">
            {running ? 'Researching…' : 'Your report will appear here'}
          </h2>
          <p className="text-[13.5px]">
            {running
              ? (PHASE_LABEL[phase] ?? 'The writer agent streams the final report as it composes it.')
              : 'Enter a topic above and the agent pipeline will plan, research, self-critique, and write a cited report.'}
          </p>
        </div>
      </Panel>
    )
  }

  return (
    <Panel>
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

      <p className="text-xs text-muted">
        {words} words
        {durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
        {typeLabel ? ` · ${typeLabel}` : ''}
      </p>

      {/* A stopped run leaves a partial draft with no critique and no citation
          audit — say so, rather than presenting it as a finished report. */}
      {stopped && (
        <div className="mt-2.5 rounded-control border border-warn/35 bg-warn/10 px-3.5 py-2.5 text-[12.5px] text-warn">
          <strong>Stopped early.</strong> The critique and citation audit never ran,
          so nothing below has been verified against its sources yet.
        </div>
      )}

      {/* ── integrity summary ───────────────────────────────── */}
      {(audit || critique) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
          {audit?.uncited?.length > 0 && (
            <Badge tone="warn">{audit.uncited.length} uncited</Badge>
          )}
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
        <details className="mt-3 rounded-control border border-line bg-inset px-3.5 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-strong select-none">
            Self-critique · {critique.issues.length} issue
            {critique.issues.length === 1 ? '' : 's'} found before the revision
          </summary>
          <ul className="mt-2.5 flex list-none flex-col gap-2.5 p-0">
            {critique.issues.map((issue, i) => (
              <li key={i} className="border-l-2 border-line pl-2.5">
                <span className="text-[10.5px] font-bold tracking-[0.06em] text-muted uppercase">
                  {issue.severity} · {issue.type}
                </span>
                <p className="mt-0.5 text-[12.5px]">{issue.problem}</p>
                {issue.claim && (
                  <p className="mt-0.5 text-[12px] text-muted italic">“{issue.claim}”</p>
                )}
                {issue.fix && (
                  <p className="mt-0.5 text-[12px] text-muted">Fix: {issue.fix}</p>
                )}
              </li>
            ))}
          </ul>
          {critique.recommendations?.length > 0 && (
            <div className="mt-2.5 border-t border-line-soft pt-2">
              <span className="text-[10.5px] font-bold tracking-[0.06em] text-muted uppercase">
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

      <article
        className="mt-3 max-h-none overflow-y-auto pr-1.5 lg:max-h-[70vh]"
        ref={containerRef}
      >
        <Markdown>{report}</Markdown>
      </article>
    </Panel>
  )
}
