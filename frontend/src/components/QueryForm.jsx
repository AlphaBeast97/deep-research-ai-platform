import { useState } from 'react'
import Button from './ui/Button.jsx'
import { cn } from '../lib/cn.js'

const EXAMPLES = [
  'The state of solid-state batteries in 2026',
  'How do GLP-1 drugs affect cardiovascular health?',
  'Economics of nuclear fusion startups',
  'Long-term effects of remote work on cities',
]

export default function QueryForm({
  onRun,
  onStop,
  running,
  reportTypes = [],
  reportType,
  onReportTypeChange,
}) {
  const [value, setValue] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || running) return
    onRun(trimmed)
  }

  const selected = reportTypes.find((t) => t.id === reportType)

  return (
    <form
      className="mb-5 rounded-panel border border-line bg-surface p-4 shadow-panel"
      onSubmit={submit}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          className="flex-1 rounded-control border border-line bg-inset px-[15px] py-3 text-strong outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-[3px] focus:ring-accent/15 disabled:opacity-60"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask a research question — e.g. “Is vertical farming economically viable?”"
          disabled={running}
          maxLength={500}
          aria-label="Research topic"
        />
        {running ? (
          <Button type="button" variant="danger" size="lg" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="lg" disabled={!value.trim()}>
            Research
          </Button>
        )}
      </div>

      {/* ── Output format ────────────────────────────────────── */}
      {reportTypes.length > 0 && (
        <div className="mt-3.5">
          <div className="flex flex-wrap items-center gap-[7px]">
            <span className="mr-0.5 text-xs font-semibold tracking-[0.06em] text-muted uppercase">
              Output
            </span>
            {reportTypes.map((type) => {
              const active = type.id === reportType
              return (
                <button
                  key={type.id}
                  type="button"
                  disabled={running}
                  aria-pressed={active}
                  title={type.blurb}
                  onClick={() => onReportTypeChange?.(type.id)}
                  className={cn(
                    'rounded-full border px-3 py-[5px] text-xs transition-colors disabled:opacity-60',
                    active
                      ? 'border-accent bg-accent/15 font-semibold text-accent'
                      : 'border-line-soft bg-surface-2 text-muted hover:border-accent hover:text-strong',
                  )}
                >
                  {type.label}
                </button>
              )
            })}
          </div>
          {selected && <p className="mt-2 text-xs text-muted">{selected.blurb}</p>}
        </div>
      )}

      {!running && (
        <div className="mt-3 flex flex-wrap items-center gap-[7px]">
          <span className="mr-0.5 text-xs text-muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full border border-line-soft bg-surface-2 px-3 py-[5px] text-xs text-muted transition-colors hover:border-accent hover:text-strong"
              onClick={() => setValue(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
