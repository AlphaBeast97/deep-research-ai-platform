/**
 * The run's citation namespace.
 *
 * Citation numbers are global to a run — the writer emits `[3]` and the UI
 * resolves it against the run's source list — so they have to be assigned once,
 * in one place, and every sub-question has to share the same numbering.
 *
 * The subtle part is what `add` returns for a URL that already has a number. A
 * later sub-question whose search surfaces a URL an earlier sub-question already
 * found must still receive that source: the researcher extracts from what it is
 * given, so dropping the repeat would leave it reasoning over a strictly smaller
 * evidence set than the search returned (and the source then shows up as
 * "available but never cited" in the audit). Only the *client* cares about
 * novelty — `isNew` tells the caller whether to stream the source to the UI.
 */

/**
 * Key URLs by what actually identifies the page: ignore the fragment and a
 * trailing slash so `example.com/report` and `example.com/report/#top` are one
 * source rather than two. The stored `url` is always the original string.
 */
export function normalizeUrl(url) {
  return String(url || '')
    .trim()
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

export class SourceIndex {
  constructor() {
    this.byUrl = new Map()
    this.list = []
  }

  get size() {
    return this.list.length
  }

  /** Already-known sources, most recently added first. */
  has(url) {
    return this.byUrl.has(normalizeUrl(url))
  }

  /**
   * Number a search result, reusing the number if the URL is already known.
   *
   * @returns {{ source: object, isNew: boolean } | null} `null` when the result
   *   carries no usable URL.
   */
  add(raw, subQuestion) {
    const key = normalizeUrl(raw?.url)
    if (!key) return null

    const known = this.byUrl.get(key)
    if (known) return { source: known, isNew: false }

    const source = {
      id: `s${this.list.length + 1}`,
      index: this.list.length + 1,
      title: raw.title,
      url: raw.url,
      snippet: raw.snippet,
      score: raw.score,
      subQuestion,
    }
    this.list.push(source)
    this.byUrl.set(key, source)
    return { source, isNew: true }
  }
}
