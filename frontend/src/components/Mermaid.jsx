import { useEffect, useId, useMemo, useState } from 'react'
import { repairMermaid } from '../lib/mermaid.js'

/**
 * Lazily loads Mermaid once, then reuses the instance for every diagram. The
 * large library is only fetched when a report actually contains a diagram.
 */
let mermaidPromise = null

const loadMermaid = () =>
  (mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => mermaid))

/** Mermaid's own theme name for the app's resolved theme. */
const mermaidTheme = (theme) => (theme === 'light' ? 'default' : 'dark')

const EMPTY = { chart: null, theme: null, svg: '', failed: false }

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
 *
 * The diagram is redrawn when the reader switches theme: `applyTheme` announces
 * the resolved theme, and the render id carries it so a redraw cannot collide
 * with the previous SVG.
 */
export default function Mermaid({ chart }) {
  const reactId = useId()
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [result, setResult] = useState(EMPTY)

  // Mermaid ids must be plain alphanumerics — useId() contains colons.
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${theme}`
  const raw = (chart || '').trim()
  const source = useMemo(() => repairMermaid(raw).trim(), [raw])

  useEffect(() => {
    const onChange = (event) => setTheme(event.detail)
    window.addEventListener('mad-theme', onChange)
    return () => window.removeEventListener('mad-theme', onChange)
  }, [])

  useEffect(() => {
    if (!source) return
    let cancelled = false

    const timer = setTimeout(() => {
      loadMermaid()
        .then((mermaid) => {
          mermaid.initialize({
            startOnLoad: false,
            // 'strict' sanitises labels and disables click handlers/HTML labels —
            // important because report text is model-generated.
            securityLevel: 'strict',
            theme: mermaidTheme(theme),
            fontFamily: 'inherit',
            themeVariables: { fontSize: '14px' },
          })
          return mermaid.render(renderId, source)
        })
        .then(({ svg }) => {
          if (!cancelled) setResult({ chart: source, theme, svg, failed: false })
        })
        .catch(() => {
          if (!cancelled) setResult({ chart: source, theme, svg: '', failed: true })
        })
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source, renderId, theme])

  // Ignore stale results while a newer version of the diagram is pending.
  const current = result.chart === source && result.theme === theme
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
