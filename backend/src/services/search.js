import { tavily } from '@tavily/core'
import config from '../config.js'

// Full page text is truncated before it reaches a prompt: enough for grounding,
// bounded so a handful of sources can't blow up the context window.
const MAX_PAGE_CHARS = 6000
// Snippets stay short — they are what the source panel shows the user.
const MAX_SNIPPET_CHARS = 800

const collapse = (text) => (text || '').replace(/\s+/g, ' ').trim()

let tvly = null
if (!config.mockMode && config.tavily.apiKey) {
  tvly = tavily({ apiKey: config.tavily.apiKey })
}

/**
 * Run a web search and normalize Tavily's response into a stable shape the
 * agents can rely on. Returns an array of { title, url, snippet, score }.
 */
export async function webSearch(query, { maxResults, topic = 'general' } = {}) {
  const limit = maxResults ?? config.tavily.maxResults

  if (!tvly) {
    return mockSearch(query, limit)
  }

  const res = await tvly.search(query, {
    maxResults: limit,
    searchDepth: config.research.depth === 'deep' ? 'advanced' : 'basic',
    topic,
    includeAnswer: false,
  })

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
export async function fetchPages(urls) {
  const unique = [...new Set(urls)].filter(Boolean)
  if (!tvly || unique.length === 0) return new Map()

  const res = await tvly.extract(unique, {
    extractDepth: config.research.depth === 'deep' ? 'advanced' : 'basic',
    format: 'markdown',
  })

  const pages = new Map()
  for (const r of res.results || []) {
    const text = collapse(r.rawContent)
    if (text) pages.set(r.url, text.slice(0, MAX_PAGE_CHARS))
  }
  return pages
}

/**
 * Deterministic canned results so the app is fully runnable before any API
 * keys are added. Clearly marked so it is never mistaken for real research.
 */
function mockSearch(query, limit) {
  const base = query.replace(/[^\w\s]/g, '').slice(0, 60)
  return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
    title: `[mock] ${base} — reference ${i + 1}`,
    url: `https://example.com/mock/${encodeURIComponent(base)}-${i + 1}`,
    snippet:
      'This is placeholder search content returned because no TAVILY_API_KEY is set. Add your key to .env to fetch real sources.',
    score: 0.9 - i * 0.1,
  }))
}
