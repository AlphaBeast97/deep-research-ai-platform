import { tavily } from '@tavily/core'
import config from '../config.js'

// Full page text is truncated before it reaches a prompt: enough for grounding,
// bounded so a handful of sources can't blow up the context window.
const MAX_PAGE_CHARS = 6000
// Snippets stay short — they are what the source panel shows the user.
const MAX_SNIPPET_CHARS = 800

const collapse = (text) => (text || '').replace(/\s+/g, ' ').trim()

let tvly = null
if (config.tavily.apiKey) {
  tvly = tavily({ apiKey: config.tavily.apiKey })
}

// Startup validation guarantees a key, but the client is built lazily above so
// a misconfigured import fails with a clear message instead of a TypeError.
const requireClient = () => {
  if (!tvly) throw new Error('TAVILY_API_KEY is not configured')
  return tvly
}

/**
 * The Tavily client takes no abort signal, so the call is raced against one:
 * when the user stops the run we stop waiting immediately rather than letting a
 * slow search hold the pipeline open. (The underlying request still completes
 * in the background — it simply stops mattering.)
 */
function abortable(promise, signal) {
  if (!signal) return promise

  const reason = () =>
    signal.reason instanceof Error
      ? signal.reason
      : Object.assign(new Error('The run was stopped.'), { name: 'AbortError' })

  if (signal.aborted) return Promise.reject(reason())

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(reason())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

/**
 * Run a web search and normalize Tavily's response into a stable shape the
 * agents can rely on. Returns an array of { title, url, snippet, score }.
 */
export async function webSearch(query, { maxResults, topic = 'general', signal } = {}) {
  const limit = maxResults ?? config.tavily.maxResults

  const res = await abortable(
    requireClient().search(query, {
      maxResults: limit,
      searchDepth: config.research.depth === 'deep' ? 'advanced' : 'basic',
      topic,
      includeAnswer: false,
    }),
    signal,
  )

  return (res.results || []).map((r) => ({
    title: r.title || 'Untitled source',
    url: r.url,
    snippet: collapse(r.content).slice(0, MAX_SNIPPET_CHARS),
    score: r.score ?? null,
  }))
}

/**
 * Fetch the full text of specific pages via Tavily's extract endpoint.
 *
 * This is the second research tool: after a search returns ranked links, the
 * researcher can pull the actual article text for the strongest ones instead of
 * reasoning from a 2-line snippet. Returns a Map of url → cleaned page text;
 * unreadable pages are simply absent (extract reports them in `failedResults`
 * and we drop them).
 */
export async function fetchPages(urls, { signal } = {}) {
  const unique = [...new Set(urls)].filter(Boolean)
  if (unique.length === 0) return new Map()

  const res = await abortable(
    requireClient().extract(unique, {
      extractDepth: config.research.depth === 'deep' ? 'advanced' : 'basic',
      format: 'markdown',
    }),
    signal,
  )

  const pages = new Map()
  for (const r of res.results || []) {
    const text = collapse(r.rawContent)
    if (text) pages.set(r.url, text.slice(0, MAX_PAGE_CHARS))
  }
  return pages
}
