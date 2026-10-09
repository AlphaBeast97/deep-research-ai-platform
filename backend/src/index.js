import config, { missingKeys } from './config.js'
import { createApp } from './app.js'
import { initStorage, storageName } from './db/index.js'

async function start() {
  let storageInfo = storageName
  try {
    storageInfo = await initStorage()
  } catch (err) {
    console.error(`\n✗ Could not initialise storage: ${err.message}`)
    console.error('  If STORAGE=mongo, check MONGODB_URI. Falling back is not automatic.\n')
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
    if (config.mockMode) {
      console.log(`  └─ MOCK MODE   missing: ${missingKeys().join(', ') || 'forced'}`)
      console.log('     Add keys to backend/.env and restart for real research.\n')
    } else {
      console.log('  └─ live mode   LLM + Tavily configured\n')
    }
  })
}

start()
