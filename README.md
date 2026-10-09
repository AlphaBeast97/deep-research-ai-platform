# Deep Research — Agentic AI

A MERN-stack deep-research platform. Ask a question and a pipeline of AI agents
**plans** the investigation, **searches the web**, extracts grounded findings,
and **streams a cited report** back to your browser token by token.

- **M**ongoDB (optional — file store by default, swap in Atlas with one env var)
- **E**xpress + Node backend running the agent pipeline
- **R**eact (Vite) frontend with a live agent trace
- **N**ode.js 18+

> 📐 **Architecture & decision record:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —
> every design decision with the alternatives that were rejected, 16 diagrams, and
> measured performance. Read it before changing anything structural.

---

## How it works

```
                 ┌──────────────────────────────────────────────┐
  POST /api/research/stream  │  Express (SSE)                    │
        (topic)              │                                   │
        ───────────────────► │  1. Planner     decompose topic   │
                             │        │        → 3–6 sub-questions│
                             │        ▼                          │
                             │  2. Researcher  Tavily search      │
                             │        │        → numbered sources │
                             │        │        → cited findings   │
                             │        ▼                          │
                             │  3. Writer      synthesize         │
                             │                 → streamed markdown│
                             │        │                          │
                             │        ▼                          │
                             │  4. Save to storage                │
                 ◄───────────┴───────────────────────────────────┘
   meta · status · plan · step · sources · findings · token · done
```

Every stage emits a Server-Sent Event, so the UI shows the agents working in
real time rather than waiting for one final blob of text.

| Agent | Job | Model |
| --- | --- | --- |
| **Planner** | Decomposes the topic into searchable sub-questions + a report title | `LLM_MODEL_SMART` |
| **Researcher** | Searches Tavily per sub-question, returns findings where every claim cites source numbers | `LLM_MODEL` |
| **Writer** | Synthesizes all findings into a streamed Markdown report with inline `[n]` citations | `LLM_MODEL_SMART` |

---

## Project structure

```
.
├── backend/
│   ├── .env.example           # every setting, documented
│   └── src/
│       ├── index.js           # server bootstrap (storage + listen)
│       ├── app.js             # Express app factory (routes, CORS, errors)
│       ├── config.js          # env parsing + mock-mode detection
│       ├── llm.js             # LLM client (any OpenAI-compatible provider)
│       ├── agents/
│       │   ├── orchestrator.js  # runs the pipeline, emits SSE events
│       │   ├── planner.js
│       │   ├── researcher.js
│       │   ├── writer.js
│       │   ├── mock.js          # canned data for keyless mock mode
│       │   └── prompts.js       # all agent prompts in one place
│       ├── services/search.js   # Tavily search + normalisation
│       ├── routes/research.js   # SSE + history endpoints
│       └── db/
│           ├── index.js         # storage facade (picks driver)
│           ├── fileStore.js     # default — zero setup
│           └── mongoStore.js    # MongoDB Atlas
└── frontend/
    └── src/
        ├── App.jsx
        ├── index.css            # Tailwind v4 + theme tokens + report styles
        ├── api.js               # SSE stream parser + REST calls
        ├── hooks/useResearch.js # run lifecycle state machine
        ├── lib/                 # format · export · class-name helpers
        └── components/
            ├── ui/              # Button · Panel · Badge primitives
            ├── QueryForm · AgentTrace · ReportView
            ├── SourcesPanel · HistoryPanel
            └── Markdown.jsx · Mermaid.jsx   # report rendering + diagrams
```

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in your keys
npm run dev               # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Open **http://localhost:5173** and ask a research question.

> **Runs without keys.** If no LLM key/URL or `TAVILY_API_KEY` is set the
> backend starts in **mock mode** and streams a canned report, so you can see
> the full UI working before wiring up credentials. The UI shows a `Mock mode`
> badge whenever this is active.

### 3. Keys you need

| Variable | Where to get it |
| --- | --- |
| `LLM_API_KEY` | Your provider's dashboard — **any OpenAI-compatible provider**, see below |
| `TAVILY_API_KEY` | https://app.tavily.com/home |

---

## Bring your own model

**OpenAI is not required.** The backend uses the OpenAI *SDK* only as a client
protocol — point it at whatever endpoint you like and it will use your model:

```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=your-provider-key
LLM_MODEL=llama-3.3-70b-versatile
LLM_MODEL_SMART=llama-3.3-70b-versatile
```

Any provider exposing an OpenAI-compatible `/v1/chat/completions` endpoint works
(model names must match that provider's own catalogue):

| Provider | `LLM_BASE_URL` | Example model |
| --- | --- | --- |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (local) | `http://localhost:1234/v1` | your loaded model |
| vLLM (local) | `http://localhost:8000/v1` | your served model |
| OpenAI (optional) | `https://api.openai.com/v1` | `gpt-4o-mini` / `gpt-4o` |

Notes:

- **Local servers need no real key** — set `LLM_API_KEY` to any placeholder
  (e.g. `ollama`) and the backend will still start in live mode.
- **`LLM_JSON_MODE=false`** — some providers and local models reject
  `response_format: { type: "json_object" }`. Turn this off and the agents fall
  back to prompt-guided JSON with a parser that salvages the first `{...}` block.
- The startup banner and `GET /api/health` report the active provider
  (`llmProvider`) and whether JSON mode is on (`jsonMode`), so you can confirm
  which backend you're talking to.
- The older `OPENAI_*` names are still read as fallbacks, but `LLM_*` wins.

---

## Switching to MongoDB Atlas

The storage layer is behind a facade (`backend/src/db/index.js`) with two
interchangeable drivers, so this needs **no code changes**:

1. Create a free cluster at https://www.mongodb.com/cloud/atlas.
2. Under **Database → Connect → Drivers**, copy the connection string
   (it looks like `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/`).
3. Add your IP to the Atlas access list (or allow `0.0.0.0/0` for dev).
4. Edit `backend/.env`:

   ```env
   STORAGE=mongo
   MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/deep-research?retryWrites=true&w=majority
   ```

5. Restart the backend. The startup banner will confirm:

   ```
   ├─ storage     mongo (cluster0-shard-00-00.xxxxx.mongodb.net)
   ```

Reports move from `backend/data/reports.json` into a `reports` collection.
Flip `STORAGE=file` to go back at any time.

---

## Configuration

All backend settings live in `backend/.env` (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Backend port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `LLM_API_KEY` | — | Your provider's key (use a placeholder for local servers) |
| `LLM_BASE_URL` | *(empty)* | Any OpenAI-compatible endpoint; empty = api.openai.com |
| `LLM_MODEL` | `gpt-4o-mini` | Researcher model (cheap, called most often) |
| `LLM_MODEL_SMART` | `gpt-4o` | Planner + writer model |
| `LLM_JSON_MODE` | `true` | Set `false` if your provider rejects `response_format=json_object` |
| `TAVILY_API_KEY` | — | Required for live mode |
| `TAVILY_MAX_RESULTS` | `5` | Sources per sub-question |
| `MAX_SUBQUESTIONS` | `5` | Planner breadth (clamped to 1–8) |
| `RESEARCH_DEPTH` | `deep` | `deep` uses Tavily's advanced search; `quick` is faster/cheaper |
| `STORAGE` | `file` | `file` or `mongo` |
| `MONGODB_URI` | — | Required when `STORAGE=mongo` |
| `MOCK_MODE` | `false` | Force mock mode even with keys present |

The frontend reads `VITE_API_URL` (defaults to `http://localhost:5000`) — copy
`frontend/.env.example` to `frontend/.env` to change it.

---

## API

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/research/stream` | Run the pipeline, stream SSE events. Body: `{ "query": "..." }` |
| `GET` | `/api/research` | Report history (newest first, summaries only) |
| `GET` | `/api/research/:id` | Full stored report |
| `DELETE` | `/api/research/:id` | Delete a report |
| `GET` | `/api/health` | Mode, storage driver, models, missing keys |

**SSE event types** (each frame is `data: {...}`):

`meta` · `status` · `plan` · `step` · `sources` · `findings` · `token` · `done` · `error`

---

## Features

- **Live agent trace** — planner, researchers, and writer report progress as they work.
- **Multi-agent pipeline** — planning, retrieval, and synthesis are separate steps with separate prompts.
- **Mermaid diagrams in the report** — the writer embeds ```` ```mermaid ```` flowcharts/timelines where they
  clarify a process, and the UI renders them as SVG (with a graceful fallback to the raw source).
- **Citations & sources panel** — inline `[n]` markers become clickable chips that scroll to the matching source card.
- **Export** — copy as Markdown, download `.md` (diagrams preserved as code), or print/save as PDF.
- **Saved history** — every completed report is persisted and can be reopened or deleted.
- **Tailwind CSS v4 UI** — dark-first design tokens, light theme via `prefers-color-scheme`, no hand-written component CSS.

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | Node 18+, Express 4, ES modules |
| Agents | Any OpenAI-compatible endpoint via the OpenAI SDK (`LLM_BASE_URL`) |
| Search | Tavily (`@tavily/core`) |
| Storage | JSON file (default) or MongoDB Atlas (`STORAGE=mongo`) |
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| Report rendering | `react-markdown` + `remark-gfm`, `mermaid` for diagrams |

## Notes & limitations

- No authentication in this version — the history is shared/global.
- Tavily is the only search provider wired in; add another by extending `backend/src/services/search.js`.
- Any OpenAI-compatible LLM works via `LLM_BASE_URL` — but quality varies. Very small local models may produce malformed JSON or weak citations; `LLM_JSON_MODE=false` plus a larger model helps.
- Mock mode output is clearly labelled and is never real research.
