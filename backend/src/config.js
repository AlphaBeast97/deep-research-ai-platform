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

    // ── stall protection ──────────────────────────────────────
    // The OpenAI SDK defaults to a 10-minute timeout and 2 retries, so a
    // provider that accepts a request and then sends nothing holds the whole
    // run for up to half an hour. These three knobs bound that wait instead.
    // Hard ceiling on one request (headers + body).
    timeoutMs: clamp(int(process.env.LLM_TIMEOUT_MS, 120_000), 5_000, 600_000),
    // Two retries (the SDK's own default) ride out a transient 5xx, which is
    // common on shared provider endpoints. Worst case is roughly
    // (retries + 1) × timeoutMs, which RUN_TIMEOUT_MS still caps.
    maxRetries: clamp(int(process.env.LLM_MAX_RETRIES, 2), 0, 3),
    // How long a *streamed* answer may go without emitting a token before it is
    // treated as stalled. A stream that is still producing text is never cut
    // off, however long the report takes.
    streamIdleTimeoutMs: clamp(
      int(process.env.LLM_STREAM_IDLE_TIMEOUT_MS, 60_000),
      5_000,
      600_000,
    ),
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
    // How many of the draft's cited sources the critic reads in full page text
    // rather than as a search snippet (0 = snippets only).
    criticFullTextSources: clamp(int(process.env.CRITIC_FULL_TEXT_SOURCES, 8), 0, 16),
    // Sub-questions researched in parallel. The sub-questions are independent,
    // so this is the main wall-clock lever; kept modest by default so a
    // provider with per-minute limits is not hammered.
    concurrency: clamp(int(process.env.RESEARCH_CONCURRENCY, 3), 1, 6),
    // Absolute ceiling on one run, so no combination of slow model and slow
    // search can hold a request (and a heartbeat) open indefinitely.
    runTimeoutMs: clamp(int(process.env.RUN_TIMEOUT_MS, 900_000), 60_000, 3_600_000),
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
