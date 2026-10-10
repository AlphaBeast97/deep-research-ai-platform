# Deep Research — Agentic AI

A MERN-stack deep-research platform. Ask a question and a pipeline of AI agents
**plans** the investigation, **searches the web**, **reads pages in full**,
fills its own **gaps**, **drafts** a report, **critiques** that draft against its
own sources, **revises** it, and runs a **citation audit** before **streaming the
finished report** back to your browser token by token.

- **M**ongoDB (optional — file store by default, swap in Atlas with one env var)
- **E**xpress + Node backend running the agent pipeline
- **R**eact (Vite) frontend with a live agent trace
- **N**ode.js 18+

> 📐 **Architecture & decision record:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —
> every design decision with the alternatives that were rejected, 22 ADRs,
> 16 diagrams, and measured performance. Read it before changing anything structural.

---

## How it works

Six phases. The middle one loops: a sub-question keeps getting searched, read,
and extracted until the researcher is confident enough, then the whole set is
handed forward for drafting, self-critique, revision, and auditing.

```
                 ┌────────────────────────────────────────────────────────────┐
  POST /api/research/stream │  Express (SSE)                                │
      (topic)                │                                               │
      ─────────────────────► │  1. PLAN      decompose → 3–8 sub-questions    │
                             │        │                                       │
                             │        ▼   (per sub-question)                 │
                             │  2. RESEARCH  ┌─ SEARCH  Tavily (basic/adv)    │
                             │        │      ├─ READ    full pages (extract)  │
                             │        │      ├─ EXTRACT → cited findings      │
                             │        │      └─ GAP?  coverage low → ⟲ again   │
                             │        ▼                                       │
                             │  3. DRAFT     synthesize → streamed markdown   │
                             │  4. CRITIQUE  audit draft against its sources  │
                             │  5. REVISE    fix what the critique found      │
                             │  6. AUDIT     sanitize + verify [n] citations  │
                             │        │                                       │
                             │        ▼                                       │
                             │  7. SAVE to storage                            │
                 ◄───────────┴───────────────────────────────────────────────┘
   meta · phase · status · plan · step · sources · findings · token
   · critique · report-reset · audit · done · error
```

Every stage emits a Server-Sent Event, so the UI shows the agents working in
real time rather than waiting for one final blob of text. Because the pipeline
can take a few minutes, the `phase` event tells the UI which phase is running
and how long the previous one took.

| Agent | Job | Model |
| --- | --- | --- |
| **Planner** | Decomposes the topic into a scope note, an intent, searchable sub-questions and a report title | `LLM_MODEL_SMART` |
| **Researcher** | Searches Tavily per sub-question (and reads the strongest pages in full), returns cited findings plus a self-reported coverage/confidence score | `LLM_MODEL` |
| **Follow-ups** | Reads low-coverage findings and proposes targeted follow-up search queries (the gap-filling loop) | `LLM_MODEL` |
| **Writer** | Synthesizes all findings into a streamed Markdown report with inline `[n]` citations, then rewrites it during revision | `LLM_MODEL_SMART` |
| **Critic** | Audits the draft against its own sources — unsupported claims, citation errors, missing angles — and returns a verdict | `LLM_MODEL_SMART` |

The `citations.js` module is a **pure** function (no model, no I/O): it scans the
final text for `[n]` markers, drops any that don't resolve to a real source, and
reports coverage for the UI.

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
│       │   ├── orchestrator.js  # runs the six phases, emits 13 SSE events
│       │   ├── planner.js
│       │   ├── researcher.js    # search + extract + coverage/confidence
│       │   ├── followups.js     # gap-filling query generation
│       │   ├── writer.js        # writeDraft + reviseReport (both streamed)
│       │   ├── critic.js        # critique() + hasMaterialIssues()
│       │   ├── citations.js     # pure citation audit + sanitizer
│       │   ├── mock.js          # canned data exercising every phase
│       │   └── prompts.js       # all 7 agent prompts in one place
│       ├── services/search.js   # Tavily search + fetchPages (full-text extract)
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
        ├── hooks/useResearch.js # run lifecycle state machine (13 events)
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
> backend starts in **mock mode** and streams a canned report through all six
> phases, so you can see the full UI working before wiring up credentials. The
> UI shows a `Mock mode` badge whenever this is active.

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
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash-lite` |
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
| `LLM_MODEL` | `gpt-4o-mini` | Researcher / follow-up model (cheap, called most often) |
| `LLM_MODEL_SMART` | `gpt-4o` | Planner, writer and critic model |
| `LLM_JSON_MODE` | `true` | Set `false` if your provider rejects `response_format=json_object` |
| `TAVILY_API_KEY` | — | Required for live mode (powers search **and** full-page extraction) |
| `TAVILY_MAX_RESULTS` | `6` | Sources per search (clamped 1–12) |
| `MAX_SUBQUESTIONS` | `6` | Planner breadth (clamped 1–8) |
| `RESEARCH_DEPTH` | `deep` | `deep` uses Tavily's advanced search; `quick` is faster/cheaper |
| `RESEARCH_MAX_ROUNDS` | `2` | Extra gap-filling search rounds per sub-question (0–3; `0` disables) |
| `COVERAGE_FLOOR` | `60` | Self-reported coverage (%) below which a gap round fires (0–100) |
| `MAX_FOLLOWUP_QUERIES` | `2` | Follow-up queries the researcher may propose per gap round (0–4) |
| `DEEP_FETCH` | `true` | Read full page text for the strongest sources instead of snippets only |
| `DEEP_FETCH_SOURCES` | `3` | Pages read in full per sub-question (0–8) |
| `RESEARCH_CRITIQUE` | `true` | Run the critic → revisor pass before saving |
| `VERIFY_CITATIONS` | `8` | Reserved — parsed into config but not yet consumed |
| `STORAGE` | `file` | `file` or `mongo` |
| `MONGODB_URI` | — | Required when `STORAGE=mongo` |
| `MOCK_MODE` | `false` | Force mock mode even with keys present |

To make runs much faster at the cost of depth, set `RESEARCH_MAX_ROUNDS=0`,
`DEEP_FETCH=false` and `RESEARCH_CRITIQUE=false` — that restores the original
single-pass behaviour.

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
| `GET` | `/api/health` | Mode, storage driver, models, depth/research knobs, missing keys |

**SSE event types** (each frame is `data: {...}`) — 13 in total:

| Event | Payload | Purpose |
| --- | --- | --- |
| `meta` | `{ query, model, smartModel, depth, critique, deepFetch, maxRounds, mock }` | Run begins; tells the client the active model + depth settings |
| `phase` | `{ phase }` | Entering a pipeline phase (`plan`/`research`/`draft`/`critique`/`revision`/`audit`). Per-phase durations are recorded in the final record's `phases[]` |
| `status` | `{ message }` | Human-readable progress line |
| `plan` | `{ title, scope, subQuestions }` | Planner output |
| `step` | `{ step }` | Fine-grained agent trace entry |
| `sources` | `{ sources, total }` | Newly discovered sources |
| `findings` | `{ subQuestion, extraction }` | Cited findings (with coverage/confidence) |
| `token` | `{ text }` | A streamed chunk of the report |
| `critique` | `{ critique }` | The critic's verdict + issues |
| `report-reset` | `{}` | Discard the draft shown so far — a revision is about to stream |
| `audit` | `{ audit }` | Citation audit: coverage, uncited, invalid, removed |
| `done` | `{ record }` | Final persisted record |
| `error` | `{ message }` | Terminal failure |

---

## Features

- **Six-phase pipeline with iterative depth** — the researcher loops on its own:
  low coverage triggers follow-up searches, so the plan isn't a one-shot guess.
- **Deep fetch** — the strongest sources are read as full pages (Tavily `extract`)
  instead of only search snippets, so findings are grounded in more than a teaser.
- **Self-critique & revision** — a critic audits the draft against its own
  sources, then the writer revises it. The revision runs **unconditionally**, so
  a verdict alone can't silently skip the fix.
- **Citation audit** — before saving, every `[n]` marker is checked against the
  real source list; unresolvable ones are removed and coverage is reported.
- **Live agent trace** — a phase badge, per-agent steps, and the critic's issues
  appear as they happen, so a multi-minute run never looks frozen.
- **Honesty in the UI** — an integrity strip and a self-critique panel surface the
  audit numbers and the critic's verdict instead of hiding them.
- **Mermaid diagrams in the report** — the writer embeds ```` ```mermaid ```` flowcharts/timelines where they
  clarify a process, and the UI renders them as SVG (with a graceful fallback to the raw source).
- **Citations & sources panel** — inline `[n]` markers become clickable chips that scroll to the matching source card.
- **Export** — copy as Markdown, download `.md` (diagrams preserved as code), or print/save as PDF.
- **Saved history** — every completed report is persisted (with its plan, critique
  and audit) and can be reopened or deleted.
- **Tailwind CSS v4 UI** — dark-first design tokens, light theme via `prefers-color-scheme`, no hand-written component CSS.

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | Node 18+, Express 4, ES modules |
| Agents | Any OpenAI-compatible endpoint via the OpenAI SDK (`LLM_BASE_URL`) |
| Search | Tavily (`@tavily/core`) — search + full-page extraction |
| Storage | JSON file (default) or MongoDB Atlas (`STORAGE=mongo`) |
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| Report rendering | `react-markdown` + `remark-gfm`, `mermaid` for diagrams |

## Notes & limitations

- No authentication in this version — the history is shared/global.
- Tavily is the only search provider wired in; add another by extending `backend/src/services/search.js`.
- Depth costs latency: a full live run (gap rounds + critique + revision) takes
  **~2–3 minutes**, versus ~40 s for the original single-pass pipeline. The
  dials in the config table above trade it back.
- The critic is the same model family as the writer, so it shares their blind
  spots — it is a useful second pass, not an independent adjudicator.
- Deep fetch only pulls the top-ranked URLs per sub-question; long pages are
  truncated (currently ~6,000 chars) before extraction.
- `VERIFY_CITATIONS` is parsed but not yet consumed by any agent.
- Any OpenAI-compatible LLM works via `LLM_BASE_URL` — but quality varies. Very small local models may produce malformed JSON or weak citations; `LLM_JSON_MODE=false` plus a larger model helps.
- Mock mode output is clearly labelled and is never real research.
