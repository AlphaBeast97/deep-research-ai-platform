import { useEffect, useId, useMemo, useState } from 'react'
import { repairMermaid } from '../lib/mermaid.js'

/**
 * Lazily loads and configures Mermaid exactly once, then reuses the instance
 * for every diagram. The large library is only fetched when a report actually
 * contains a diagram.
 */
let mermaidPromise = null

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true
      mermaid.initialize({
        startOnLoad: false,
        // 'strict' sanitises labels and disables click handlers/HTML labels —
        // important because report text is model-generated.
        securityLevel: 'strict',
        theme: prefersDark ? 'dark' : 'default',
        fontFamily: 'inherit',
        themeVariables: { fontSize: '14px' },
      })
      return mermaid
    })
  }
  return mermaidPromise
}

const EMPTY = { chart: null, svg: '', failed: false }

/**
 * Renders a single Mermaid diagram from its source text. Falls back to the raw
 * definition when the diagram is malformed, so a bad block never blanks the
 * report. Renders are debounced so a report streaming token-by-token does not
 * kick off a parse for every keystroke.
 *
 * The source goes through `repairMermaid` first. The writer agent reliably
 * produces a couple of shapes Mermaid's grammar rejects — Unicode arrows and
 * unquoted parentheses in labels — and a repair is better than a fallback: it
 * keeps the diagram the report's prose refers to. What is repaired is what is
 * shown here and what the fallback displays, so the two can never disagree.
 */
export default function Mermaid({ chart }) {
  const reactId = useId()
  const [result, setResult] = useState(EMPTY)

  // Mermaid ids must be plain alphanumerics — useId() contains colons.
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`
  const raw = (chart || '').trim()
  const source = useMemo(() => repairMermaid(raw).trim(), [raw])

  useEffect(() => {
    if (!source) return
    let cancelled = false

    const timer = setTimeout(() => {
      loadMermaid()
        .then((mermaid) => mermaid.render(renderId, source))
        .then(({ svg }) => {
          if (!cancelled) setResult({ chart: source, svg, failed: false })
        })
        .catch(() => {
          if (!cancelled) setResult({ chart: source, svg: '', failed: true })
        })
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source, renderId])

  // Ignore stale results while a newer version of the diagram is pending.
  const current = result.chart === source
  const svg = current ? result.svg : ''
  const failed = current && result.failed

  if (failed) {
    return (
      <figure className="mermaid-figure">
        <pre className="overflow-x-auto text-xs text-danger">
          <code>{source}</code>
        </pre>
        <figcaption className="mt-2 text-center text-[11px] text-danger">
          Diagram could not be rendered — showing its source.
        </figcaption>
      </figure>
    )
  }

  return (
    <figure className="mermaid-figure" aria-label="Diagram">
      {svg ? (
        // Mermaid output is SVG produced by the library itself with
        // securityLevel 'strict'; it is the only HTML we inject directly.
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="flex h-24 items-center justify-center text-xs text-muted">
          Rendering diagram…
        </div>
      )}
    </figure>
  )
}
