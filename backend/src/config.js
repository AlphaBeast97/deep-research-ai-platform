import dotenv from 'dotenv'

dotenv.config()

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Provider-neutral first, OpenAI-branded names kept as a fallback so existing
// `.env` files keep working. You are NOT required to use OpenAI: any endpoint
// speaking the OpenAI /v1/chat/completions protocol works (Groq, OpenRouter,
// Together, Ollama, LM Studio, vLLM, …).
const env = (neutral, legacy) => process.env[neutral] ?? process.env[legacy] ?? ''

const config = {
  port: int(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  llm: {
    apiKey: env('LLM_API_KEY', 'OPENAI_API_KEY'),
    // Empty = api.openai.com. Point it anywhere you like.
    baseUrl: env('LLM_BASE_URL', 'OPENAI_BASE_URL'),
    // Model names are passed straight through — use whatever your provider calls them.
    model: env('LLM_MODEL', 'OPENAI_MODEL') || 'gpt-4o-mini',
    smartModel:
      env('LLM_MODEL_SMART', 'OPENAI_MODEL_SMART') ||
      env('LLM_MODEL', 'OPENAI_MODEL') ||
      'gpt-4o',
    // Some servers reject response_format=json_object. When false we skip it and
    // rely on prompt-guided JSON + a parser that salvages the first {...} block.
    jsonMode: bool(process.env.LLM_JSON_MODE ?? process.env.OPENAI_JSON_MODE, true),
  },

  tavily: {
    apiKey: process.env.TAVILY_API_KEY || '',
    maxResults: clamp(int(process.env.TAVILY_MAX_RESULTS, 6), 1, 12),
  },

  research: {
    maxSubQuestions: clamp(int(process.env.MAX_SUBQUESTIONS, 6), 1, 8),
    depth: process.env.RESEARCH_DEPTH === 'quick' ? 'quick' : 'deep',

    // ── depth & integrity knobs ───────────────────────────────
    // How many extra gap-filling rounds a sub-question may get when the
    // researcher reports low coverage.
    maxRounds: clamp(int(process.env.RESEARCH_MAX_ROUNDS, 2), 0, 3),
    // Self-reported coverage (%) below which a gap-filling round is triggered.
    coverageFloor: clamp(int(process.env.COVERAGE_FLOOR, 60), 0, 100),
    // Follow-up search queries the researcher may propose per gap round.
    maxFollowUpQueries: clamp(int(process.env.MAX_FOLLOWUP_QUERIES, 2), 0, 4),
    // Fetch full page text for the strongest sources instead of snippets only.
    deepFetch: bool(process.env.DEEP_FETCH, true),
    // How many pages per sub-question to pull full text for.
    deepFetchSources: clamp(int(process.env.DEEP_FETCH_SOURCES, 3), 0, 8),
    // Run the critic → revisor pass before persisting the report.
    critique: bool(process.env.RESEARCH_CRITIQUE, true),
  },

  // MongoDB is the only storage driver — see db/index.js. There is no file
  // fallback: a report store that silently disappears on restart is worse than
  // a startup error you can fix.
  mongo: {
    uri: process.env.MONGODB_URI || '',
  },

  // Clerk authentication. The secret key is what the server verifies session
  // tokens with; the publishable key is used by the SDK's middleware too and
  // should be set alongside it.
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    secretKey: process.env.CLERK_SECRET_KEY || '',
  },
}

// The LLM counts as configured with either an API key or a base URL
// (local servers like Ollama don't issue keys).
config.llmConfigured = Boolean(config.llm.apiKey || config.llm.baseUrl)

/**
 * Settings the server cannot run without. There is no mock mode any more, so a
 * missing key is a hard startup failure rather than a silently degraded run —
 * `index.js` prints this list and exits.
 */
export const missingKeys = () => {
  const missing = []
  if (!config.llmConfigured) missing.push('LLM_API_KEY (or LLM_BASE_URL)')
  if (!config.tavily.apiKey) missing.push('TAVILY_API_KEY')
  if (!config.mongo.uri) missing.push('MONGODB_URI')
  if (!config.clerk.secretKey) missing.push('CLERK_SECRET_KEY')
  if (!config.clerk.publishableKey) missing.push('CLERK_PUBLISHABLE_KEY')
  return missing
}

export default config
