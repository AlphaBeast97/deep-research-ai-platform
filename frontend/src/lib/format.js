/** Bare hostname for a URL, falling back to the raw string when unparsable. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Human-friendly relative time, e.g. "4m ago". */
export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Filesystem-safe short slug derived from a title. */
export function slugify(text, fallback = 'report') {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return slug || fallback
}

/** Word count for a Markdown/plain-text string. */
export function wordCount(text) {
  const trimmed = (text || '').trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Thousands separators, deterministic across environments. */
export function formatNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US') : ''
}

/** Compact duration: `4ms`, `37.5s`, `1m 32s`. Null when there is nothing to show. */
export function formatDuration(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1000) return `${Math.round(n)}ms`
  const seconds = n / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`
}

/** Calendar date for a stored run, e.g. `10 Oct 2026`. */
export function formatDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
