/**
 * Theme preference: `light`, `dark` or `system`.
 *
 * The document always carries the *resolved* theme in `data-theme` — set before
 * first paint by the inline script in `index.html` — so the CSS never has to ask
 * the OS. `system` is resolved here, and re-resolved when the OS changes while
 * it is the active preference. The choice is remembered in `localStorage`.
 */
const KEY = 'mad-theme'
const QUERY = '(prefers-color-scheme: dark)'

export const THEME_OPTIONS = ['system', 'light', 'dark']

function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia(QUERY).matches
}

/** Resolve a preference to `light` or `dark`. Pure, so it is testable. */
export function resolveTheme(preference, dark = prefersDark()) {
  if (preference === 'light' || preference === 'dark') return preference
  return dark ? 'dark' : 'light'
}

/** The stored preference, defaulting to `system`. */
export function readPreference() {
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* storage blocked */
  }
  return 'system'
}

/**
 * Apply a preference to the document and announce the resolved theme, which is
 * how the Mermaid renderer learns that it needs to redraw.
 */
export function applyTheme(preference = readPreference()) {
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#17150f' : '#f7f6f2')

  window.dispatchEvent(new CustomEvent('mad-theme', { detail: resolved }))
  return resolved
}

/** Persist a preference, apply it, and return the resolved theme. */
export function setPreference(preference) {
  try {
    window.localStorage.setItem(KEY, preference)
  } catch {
    /* storage blocked — the choice still applies for this session */
  }
  return applyTheme(preference)
}

/**
 * Re-resolve when the OS or another tab changes something. Deliberately does
 * not listen to its own `mad-theme` event, or applying a theme would loop.
 */
export function watchTheme() {
  const media = window.matchMedia?.(QUERY)
  const onChange = () => applyTheme()
  media?.addEventListener?.('change', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    media?.removeEventListener?.('change', onChange)
    window.removeEventListener('storage', onChange)
  }
}
