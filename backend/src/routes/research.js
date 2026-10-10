import { getAuth } from '@clerk/express'
import { Router } from 'express'
import { runResearch } from '../agents/orchestrator.js'
import * as db from '../db/index.js'

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

  res.on('close', () => {
    closed = true
    clearInterval(heartbeat)
  })

  try {
    await runResearch({ query, ownerId: req.userId, onEvent: send })
  } catch (err) {
    console.error('[research] pipeline error:', err)
    send({ type: 'error', message: err.message || 'Research failed unexpectedly.' })
  } finally {
    clearInterval(heartbeat)
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
