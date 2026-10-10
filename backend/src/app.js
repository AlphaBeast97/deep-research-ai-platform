import { clerkMiddleware } from '@clerk/express'
import cors from 'cors'
import express from 'express'
import config, { missingKeys } from './config.js'
import { storageName } from './db/index.js'
import researchRouter from './routes/research.js'

/**
 * Builds the Express application. Kept separate from the server bootstrap
 * (index.js) so the app can be imported and exercised without binding a port —
 * e.g. in tests or a serverless adapter.
 */
export function createApp() {
  const app = express()

  app.use(cors({ origin: config.clientOrigin }))
  app.use(express.json({ limit: '1mb' }))

  // Verifies the Clerk session on every request and attaches `req.auth` (or
  // leaves it signed-out). Route-level guards read it with `getAuth(req)`.
  app.use(clerkMiddleware())

  /** Liveness + configuration probe. */
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storage: storageName,
      models: { default: config.llm.model, smart: config.llm.smartModel },
      llmProvider: config.llm.baseUrl || 'api.openai.com',
      jsonMode: config.llm.jsonMode,
      missingKeys: missingKeys(),
      depth: config.research.depth,
      research: {
        maxSubQuestions: config.research.maxSubQuestions,
        maxRounds: config.research.maxRounds,
        coverageFloor: config.research.coverageFloor,
        deepFetch: config.research.deepFetch,
        critique: config.research.critique,
      },
    })
  })

  app.use('/api/research', researchRouter)

  // Fallback error handler — turns any uncaught route error into clean JSON.
  app.use((err, _req, res, _next) => {
    console.error('[server] unhandled error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  })

  return app
}

export default createApp
