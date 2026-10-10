import config, { missingKeys } from './config.js'
import { createApp } from './app.js'
import { initStorage, storageName } from './db/index.js'

async function start() {
  // There is no mock mode any more: a missing credential is a hard stop with a
  // readable list, not a silently degraded run.
  const missing = missingKeys()
  if (missing.length) {
    console.error('\n✗ Missing required configuration:')
    for (const key of missing) console.error(`  · ${key}`)
    console.error('\n  Copy backend/.env.example to backend/.env and fill these in,')
    console.error('  then restart. See README.md → Configuration.\n')
    process.exit(1)
  }

  let storageInfo = storageName
  try {
    storageInfo = await initStorage()
  } catch (err) {
    console.error(`\n✗ Could not connect to MongoDB: ${err.message}`)
    console.error('  Check MONGODB_URI and your Atlas IP allow-list.\n')
    process.exit(1)
  }

  const app = createApp()

  app.listen(config.port, () => {
    console.log('\n  Deep Research backend')
    console.log(`  ├─ listening   http://localhost:${config.port}`)
    console.log(`  ├─ client      ${config.clientOrigin}`)
    console.log(`  ├─ storage     ${storageInfo}`)
    console.log(`  ├─ llm         ${config.llm.baseUrl || 'api.openai.com'}`)
    console.log(`  ├─ model       ${config.llm.model} (smart: ${config.llm.smartModel})`)
    console.log('  └─ auth        Clerk\n')
  })
}

start()
