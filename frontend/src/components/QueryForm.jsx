import { useState } from 'react'
import Button from './ui/Button.jsx'

const EXAMPLES = [
  'The state of solid-state batteries in 2026',
  'How do GLP-1 drugs affect cardiovascular health?',
  'Economics of nuclear fusion startups',
  'Long-term effects of remote work on cities',
]

export default function QueryForm({ onRun, onStop, running }) {
  const [value, setValue] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || running) return
    onRun(trimmed)
  }

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
