import { Router } from 'express'
import { runResearch } from '../agents/orchestrator.js'
import * as db from '../db/index.js'
import config from '../config.js'

const router = Router()

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
    await runResearch({ query, onEvent: send })
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

/** GET /api/research — history summary list (newest first). */
router.get('/', async (_req, res) => {
  try {
    res.json({ reports: await db.list() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** GET /api/research/:id — full stored report. */
router.get('/:id', async (req, res) => {
  try {
    const record = await db.get(req.params.id)
    if (!record) return res.status(404).json({ error: 'Report not found.' })
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** DELETE /api/research/:id */
router.delete('/:id', async (req, res) => {
  try {
    const removed = await db.remove(req.params.id)
    res.status(removed ? 200 : 404).json({ removed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
