import { getAuth } from '@clerk/express'
import { Router } from 'express'
import { runResearch } from '../agents/orchestrator.js'
import { REPORT_TYPES } from '../agents/reportTypes.js'
import config from '../config.js'
import * as db from '../db/index.js'
import { AbortedError, isAbortError } from '../llm.js'

const router = Router()

/**
 * Every research endpoint is private. `clerkMiddleware()` (mounted in app.js)
 * has already verified the session by the time these handlers run, so we just
 * read the auth state and reject signed-out callers.
 */
router.use((req, res, next) => {
  const { isAuthenticated, userId } = getAuth(req)
  if (!isAuthenticated || !userId) {
    res.status(401).json({ error: 'Sign in to run research.' })
    return
  }
  // Reports are private: every storage call below is scoped to this id.
  req.userId = userId
  next()
})

/**
 * GET /api/research/types
 * The report types the user can choose from. Declared before `/:id` so it is
 * not swallowed by the report-lookup route. Only metadata is returned — the
 * prompt text behind each type stays on the server.
 */
router.get('/types', (_req, res) => {
  res.json({ types: REPORT_TYPES })
})

/**
 * POST /api/research/stream
 * Runs the agent pipeline and streams progress as Server-Sent Events.
 * We use POST (not the usual GET) so the topic can travel in a JSON body.
 */
router.post('/stream', async (req, res) => {
  const query = (req.body?.query || '').trim()
  if (!query) {
    res.status(400).json({ error: 'A research topic is required.' })
    return
  }
  if (query.length > 500) {
    res.status(400).json({ error: 'Research topic is too long (max 500 chars).' })
    return
  }

  // An unknown type is rejected loudly rather than silently defaulting, so a
  // typo in an API call is visible instead of producing the wrong deliverable.
  const reportType = (req.body?.reportType || '').trim()
  if (reportType && !REPORT_TYPES.some((t) => t.id === reportType)) {
    res.status(400).json({ error: `Unknown reportType: ${reportType}` })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  let closed = false
  const send = (payload) => {
    if (closed) return
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  // Keep proxies from closing an idle connection during long model calls.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n')
  }, 15_000)

  // The pipeline is handed a stop switch wired to this connection: when the
  // client goes away (the user pressed Stop, or closed the tab) the in-flight
  // model and search calls are aborted instead of spending money for nobody.
  // Without this the server kept running the whole pipeline to completion and
  // simply discarded the output.
  const controller = new AbortController()
  const runTimeoutMs = config.research.runTimeoutMs
  // An `AbortedError` (not a bare Error) so the clients below still recognise
  // this as a stop while its message survives into what the user sees.
  const deadline = setTimeout(
    () =>
      controller.abort(
        new AbortedError(
          `The run exceeded ${Math.round(runTimeoutMs / 60_000)} minutes and was stopped.`,
        ),
      ),
    runTimeoutMs,
  )

  res.on('close', () => {
    closed = true
    clearInterval(heartbeat)
    clearTimeout(deadline)
    if (!controller.signal.aborted) controller.abort(new Error('The client disconnected.'))
  })

  try {
    await runResearch({
      query,
      ownerId: req.userId,
      reportType,
      onEvent: send,
      signal: controller.signal,
    })
  } catch (err) {
    // A stop is expected, not an incident: a disconnected client has nowhere to
    // send anything (send() is a no-op once closed), and the deadline reports
    // itself through the message below.
    if (!isAbortError(err)) console.error('[research] pipeline error:', err)
    send({ type: 'error', message: err.message || 'Research failed unexpectedly.' })
  } finally {
    clearInterval(heartbeat)
    clearTimeout(deadline)
    if (!closed) {
      res.write('event: end\ndata: {}\n\n')
      res.end()
    }
  }
})

/** GET /api/research — the signed-in user's history (newest first). */
router.get('/', async (req, res) => {
  try {
    res.json({ reports: await db.list(req.userId) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** GET /api/research/:id — full stored report, if it belongs to the caller. */
router.get('/:id', async (req, res) => {
  try {
    const record = await db.get(req.params.id, req.userId)
    if (!record) return res.status(404).json({ error: 'Report not found.' })
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** DELETE /api/research/:id */
router.delete('/:id', async (req, res) => {
  try {
    const removed = await db.remove(req.params.id, req.userId)
    res.status(removed ? 200 : 404).json({ removed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
