/**
 * The status bubble shown in the report area while a run is in flight.
 *
 * It names the step the agents are on right now ("Researcher · Reading pages in
 * full"), not the raw progress line — short enough to stay one line, and it
 * changes at the pace of the trace. A pulsing dot proves the pipeline is alive,
 * a slow shimmer crosses the pill, and the text cross-fades when the step
 * changes. The text is a live region, so a screen reader hears it too.
 */
export default function StatusPill({ label, fallback = 'Working…' }) {
  const text = (label || '').trim() || fallback

  return (
    <span className="status-pill" role="status" aria-live="polite">
      <span className="status-pill__dot" aria-hidden="true" />
      {/* Remounting on the label replays the cross-fade. */}
      <span key={text} className="status-pill__text">
        {text}
      </span>
    </span>
  )
}
