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
 *
 * Expanding and collapsing animate: `max-height` is driven to the measured
 * content height (never `auto`, which cannot transition) and the veil fades with
 * it. While the content is still streaming, `animate={false}` turns the
 * transition off, so the box tracks new tokens instead of chasing them.
 */
export default function FadeBox({
  children,
  collapsedHeight = 460,
  expanded = false,
  animate = true,
  onToggle,
  label = 'Read the full report',
  collapseLabel = 'Show less',
  className,
}) {
  const id = useId()
  const contentRef = useRef(null)
  const [fullHeight, setFullHeight] = useState(0)
  const [overflows, setOverflows] = useState(false)
  const collapsed = !expanded && overflows

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    // `scrollHeight` is the *unclipped* height even while the box is capped,
    // which is exactly what an expand animates towards. The observer also
    // fires once on observe, so the first measurement costs no extra render.
    const observer = new ResizeObserver(() => {
      const height = el.scrollHeight
      setFullHeight(height)
      setOverflows(height > collapsedHeight + 16)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [collapsedHeight])

  const style = collapsed
    ? { maxHeight: collapsedHeight }
    : fullHeight
      ? { maxHeight: fullHeight }
      : undefined

  return (
    <div className={cn('fade-box', className)}>
      <div
        id={id}
        ref={contentRef}
        className={cn('fade-box__content', animate && 'fade-box__content--anim')}
        style={style}
        // Collapsed content is visible but not reachable: `inert` keeps its
        // links and chips out of the tab order and the accessibility tree.
        inert={collapsed ? true : undefined}
      >
        {children}
      </div>

      {/* Kept mounted so it can fade rather than appear; disabled and
          click-through once the block is open. */}
      {overflows && (
        <button
          type="button"
          className={cn('fade-box__veil', !collapsed && 'fade-box__veil--hidden')}
          onClick={onToggle}
          disabled={!collapsed}
          aria-controls={id}
          aria-expanded={!collapsed}
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
