import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../lib/cn.js'

/**
 * A block that fades and blurs at the bottom instead of snapping shut, with a
 * click to expand or collapse — the pattern a reader already knows from
 * ChatGPT's research cards.
 *
 * The parent owns `expanded` so a running report can stay open while it streams
 * and settle into a faded preview once it is done. The veil is only rendered
 * when the content genuinely overflows the cap, so a short block never shows a
 * pointless "show more".
 */
export default function FadeBox({
  children,
  collapsedHeight = 460,
  expanded = false,
  onToggle,
  label = 'Read the full report',
  collapseLabel = 'Show less',
  className,
}) {
  const id = useId()
  const contentRef = useRef(null)
  const [overflows, setOverflows] = useState(false)
  const collapsed = !expanded && overflows

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    // Re-measured whenever the content resizes — which it does on every
    // streamed token and on a viewport change. The observer fires once on
    // observe, so the first measurement costs no extra render.
    const observer = new ResizeObserver(() =>
      setOverflows(el.scrollHeight > collapsedHeight + 16),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [collapsedHeight])

  return (
    <div className={cn('fade-box', className)}>
      <div
        id={id}
        ref={contentRef}
        className="fade-box__content"
        style={collapsed ? { maxHeight: collapsedHeight } : undefined}
        // Collapsed content is visible but not reachable: `inert` keeps its
        // links and chips out of the tab order and the accessibility tree.
        inert={collapsed ? true : undefined}
      >
        {children}
      </div>

      {collapsed && (
        <button
          type="button"
          className="fade-box__veil"
          onClick={onToggle}
          aria-controls={id}
          aria-expanded={false}
        >
          <span className="fade-box__label">{label}</span>
        </button>
      )}

      {expanded && overflows && onToggle && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="fade-box__label fade-box__label--plain"
            onClick={onToggle}
            aria-controls={id}
            aria-expanded
          >
            {collapseLabel}
          </button>
        </div>
      )}
    </div>
  )
}
