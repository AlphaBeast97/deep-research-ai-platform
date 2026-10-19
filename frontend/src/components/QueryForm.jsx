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
      className="mb-6 rounded-panel border border-line bg-surface p-4 shadow-panel sm:p-5"
      onSubmit={submit}
    >
      <div className="mb-3.5">
        <h2 className="font-display text-[20px] tracking-tight text-strong">
          What should we dig into?
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Ask a real question. The deeper it goes, the better the report.
        </p>
      </div>

      <label htmlFor="research-topic" className="sr-only">
        Research topic
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          id="research-topic"
          className="min-w-0 flex-1 rounded-control border border-line bg-inset px-4 py-3.5 text-[15.5px] text-strong outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/12 disabled:opacity-60"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Is vertical farming economically viable?"
          disabled={running}
          maxLength={500}
        />
        {/*
          One button for both actions, deliberately. Rendering Stop and Research
          as two branches reused the same DOM node and flipped its `type` from
          "button" to "submit" while the click was still being dispatched, so
          the browser then submitted the form — aborting the run and starting a
          new one with the same query in a single click. A constant type, plus
          `preventDefault` while a run is in flight, makes the click do exactly
          one thing.
        */}
        <Button
          type="submit"
          variant={running ? 'danger' : 'primary'}
          size="lg"
          disabled={!running && !value.trim()}
          onClick={(event) => {
            if (!running) return
            event.preventDefault()
            onStop()
          }}
        >
          {running ? 'Stop' : 'Research'}
        </Button>
      </div>

      {/* ── Output format ────────────────────────────────────── */}
      {reportTypes.length > 0 && (
        <div className="mt-4">
          <span className="text-[12px] font-semibold text-muted">Deliver it as</span>
          <div className="mt-2 flex flex-wrap gap-2">
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
                    'cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] whitespace-nowrap transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    active
                      ? 'border-accent bg-accent/12 font-semibold text-accent'
                      : 'border-line-soft bg-surface-2 text-muted hover:border-accent/60 hover:text-strong',
                  )}
                >
                  {type.label}
                </button>
              )
            })}
          </div>
          {selected && <p className="mt-2 text-[12.5px] text-muted">{selected.blurb}</p>}
        </div>
      )}

      {!running && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-muted">Not sure? Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="cursor-pointer rounded-full border border-line-soft bg-surface-2 px-3 py-1.5 text-[12.5px] whitespace-nowrap text-muted transition-colors hover:border-accent/60 hover:text-strong"
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
