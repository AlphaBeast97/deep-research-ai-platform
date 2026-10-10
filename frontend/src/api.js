const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')

// Clerk session tokens are short-lived, so we fetch one per request. The app
// registers its `getToken` here once (see App.jsx) and every call below can
// authenticate without threading a token through each function signature.
let getTokenFn = null

export function setAuthTokenGetter(fn) {
  getTokenFn = fn
}

async function authHeaders(extra = {}) {
  const headers = { ...extra }
  if (getTokenFn) {
    try {
      const token = await getTokenFn()
      if (token) headers.Authorization = `Bearer ${token}`
    } catch {
      // Signed out — the backend answers 401 and the UI reacts to that.
    }
  }
  return headers
}

/**
 * Stream a research run. The backend answers with Server-Sent Events over a
 * POST request, so we read the response body as a stream and parse
 * `data: {...}\n\n` frames ourselves (EventSource can't send a POST body).
 */
export async function streamResearch(query, { onEvent, signal } = {}) {
  const res = await fetch(`${API_BASE}/api/research/stream`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query }),
    signal,
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new Error(message)
  }
  if (!res.body) throw new Error('This browser does not support streaming responses.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? '' // keep the trailing partial frame

    for (const frame of frames) {
      const dataLine = frame
        .split('\n')
        .find((line) => line.startsWith('data:'))
      if (!dataLine) continue
      const raw = dataLine.slice(5).trim()
      if (!raw) continue
      try {
        onEvent?.(JSON.parse(raw))
      } catch {
        // Ignore malformed frames rather than killing the whole run.
      }
    }
  }
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error('Backend unreachable')
  return res.json()
}

export async function fetchReports() {
  const res = await fetch(`${API_BASE}/api/research`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Could not load history')
  const body = await res.json()
  return body.reports ?? []
}

export async function fetchReport(id) {
  const res = await fetch(`${API_BASE}/api/research/${id}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Could not load that report')
  return res.json()
}

export async function deleteReport(id) {
  const res = await fetch(`${API_BASE}/api/research/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error('Could not delete that report')
  return res.json()
}
