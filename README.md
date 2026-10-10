# Deep Research — Agentic AI

A MERN-stack deep-research platform. Sign in, ask a question, and a pipeline of
AI agents **plans** the investigation, **searches the web**, **reads pages in
full**, fills its own **gaps**, **drafts** a report, **critiques** that draft
against its own sources, **revises** it, and runs a **citation audit** before
**streaming the finished report** back to your browser token by token.

- **M**ongoDB Atlas — the report store; every report is private to its owner
- **E**xpress + Node backend running the agent pipeline
- **R**eact (Vite) frontend with a live agent trace, behind **Clerk** auth
- **N**ode.js 18+

> 📐 **Architecture & decision record:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —
> every design decision with the alternatives that were rejected, 24 ADRs,
> 16 diagrams, and measured performance. Read it before changing anything structural.

---

## How it works

Six phases. The middle one loops: a sub-question keeps getting searched, read,
and extracted until the researcher is confident enough, then the whole set is
handed forward for drafting, self-critique, revision, and auditing.

```
                 ┌────────────────────────────────────────────────────────────┐
  POST /api/research/stream │  Express (SSE) · Clerk session verified       │
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
                             │  7. SAVE to MongoDB, owned by the caller       │
                 ◄───────────┴───────────────────────────────────────────────┘
   meta · phase · status · plan · step · sources · findings · token
   · critique · report-reset · audit · done · error
```

Every stage emits a Server-Sent Event, so the UI shows the agents working in
real time rather than waiting for one final blob of text. Because the pipeline
can take a few minutes, the `phase` event tells the UI which phase is running.

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
│       ├── index.js           # bootstrap: validate config → connect Mongo → listen
│       ├── app.js             # Express app factory (Clerk middleware, routes, CORS)
│       ├── config.js          # env parsing + required-key validation
│       ├── llm.js             # LLM client (any OpenAI-compatible provider)
│       ├── agents/
│       │   ├── orchestrator.js  # runs the six phases, emits 13 SSE events
│       │   ├── planner.js
│       │   ├── researcher.js    # search + extract + coverage/confidence
│       │   ├── followups.js     # gap-filling query generation
│       │   ├── writer.js        # writeDraft + reviseReport (both streamed)
│       │   ├── critic.js        # critique() + hasMaterialIssues()
│       │   ├── citations.js     # pure citation audit + sanitizer
│       │   └── prompts.js       # all 7 agent prompts in one place
│       ├── services/search.js   # Tavily search + fetchPages (full-text extract)
│       ├── routes/research.js   # SSE + history endpoints (auth-guarded)
│       └── db/
│           ├── index.js         # storage facade (owner-scoped)
│           └── mongoStore.js    # MongoDB Atlas
└── frontend/
    └── src/
        ├── main.jsx             # ClerkProvider wraps the app
        ├── App.jsx              # sign-in gate · trace · report · library
        ├── index.css            # Tailwind v4 + theme tokens + report styles
        ├── api.js               # SSE parser + REST calls (Bearer token)
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

### 1. Create the two accounts you need

| Service | What for | Where |
| --- | --- | --- |
| **Clerk** | Sign-in and per-user report ownership | https://dashboard.clerk.com |
| **MongoDB Atlas** | Storing reports | https://www.mongodb.com/cloud/atlas |
| **Tavily** | Web search + full-page extraction | https://app.tavily.com/home |

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in every required key
npm run dev               # http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # add VITE_CLERK_PUBLISHABLE_KEY
npm run dev               # http://localhost:5173
```

Open **http://localhost:5173**, sign in, and ask a research question.

> **There is no mock mode.** If a required key is missing the backend prints the
> list and refuses to start, rather than silently serving canned data.

---

## Required keys

Grab each value, drop it in `.env`, and the backend will start.

| Variable | Where to get it |
| --- | --- |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → **API keys** → Quick Copy |
| `CLERK_SECRET_KEY` | Clerk Dashboard → **API keys** → Quick Copy (server-only) |
| `MONGODB_URI` | Atlas → **Connect → Drivers** (paste your DB user's password in) |
| `LLM_API_KEY` | Your provider's dashboard — **any OpenAI-compatible provider**, see below |
| `TAVILY_API_KEY` | https://app.tavily.com/home |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same publishable key, in **`frontend/.env`** |

---

## Authentication (Clerk)

The API and the UI run on **different origins** (`:5000` and `:5173`), so Clerk's
session cookie isn't sent automatically. Instead:

1. The frontend calls `getToken()` and sends `Authorization: Bearer <token>`.
2. The backend's `clerkMiddleware()` verifies that token on every request and
   attaches `req.auth`.
3. Every `/api/research*` route requires a session and reads the user id from it.

Consequences worth knowing:

- **Reports are private.** Each stored report carries the owner's Clerk `userId`,
  and every read, list and delete is scoped to it. One user can never see
  another's history — requests for someone else's report id return `404`.
- `GET /api/health` is the only public route (the UI uses it to show status).
- The **secret key never goes to the browser**; only the publishable key does.

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

## Storage: MongoDB Atlas

MongoDB is the **only** storage driver — there is no local-file fallback, because
a report store that silently disappears on restart is worse than a startup error
you can fix.

1. Create a free cluster at https://www.mongodb.com/cloud/atlas.
2. Under **Database → Connect → Drivers**, copy the connection string
   (it looks like `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/`).
3. Add your IP to the Atlas access list (or allow `0.0.0.0/0` for dev).
4. Paste it into `backend/.env`:

   ```env
   MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/deep-research?retryWrites=true&w=majority
   ```

5. Restart the backend. The startup banner will confirm:

   ```
   ├─ storage     mongo (cluster0-shard-00-00.xxxxx.mongodb.net)
   ```

Reports live in a `reports` collection, each tagged with its owner's `userId`.

---

## Configuration

All backend settings live in `backend/.env` (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Backend port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `CLERK_PUBLISHABLE_KEY` | — | **Required.** Clerk publishable key |
| `CLERK_SECRET_KEY` | — | **Required.** Clerk secret key (server-only) |
| `MONGODB_URI` | — | **Required.** Atlas connection string |
| `LLM_API_KEY` | — | Your provider's key (use a placeholder for local servers) |
| `LLM_BASE_URL` | *(empty)* | Any OpenAI-compatible endpoint; empty = api.openai.com |
| `LLM_MODEL` | `gpt-4o-mini` | Researcher / follow-up model (cheap, called most often) |
| `LLM_MODEL_SMART` | `gpt-4o` | Planner, writer and critic model |
| `LLM_JSON_MODE` | `true` | Set `false` if your provider rejects `response_format=json_object` |
| `TAVILY_API_KEY` | — | **Required.** Powers search **and** full-page extraction |
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

To make runs much faster at the cost of depth, set `RESEARCH_MAX_ROUNDS=0`,
`DEEP_FETCH=false` and `RESEARCH_CRITIQUE=false`.

The frontend reads `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` from
`frontend/.env` (see `frontend/.env.example`).

---

## API

All research routes require a Clerk session (`Authorization: Bearer <token>`).

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | public | Mode, storage driver, models, depth knobs, missing keys |
| `POST` | `/api/research/stream` | ✅ | Run the pipeline, stream SSE events. Body: `{ "query": "..." }` |
| `GET` | `/api/research` | ✅ | The caller's report history (newest first, summaries) |
| `GET` | `/api/research/:id` | ✅ | Full stored report (only if the caller owns it) |
| `DELETE` | `/api/research/:id` | ✅ | Delete one of the caller's reports |

**SSE event types** (each frame is `data: {...}`) — 13 in total:

| Event | Payload | Purpose |
| --- | --- | --- |
| `meta` | `{ query, model, smartModel, depth, critique, deepFetch, maxRounds }` | Run begins; reports the active model + depth settings |
| `phase` | `{ phase }` | Entering a phase (`plan`/`research`/`draft`/`critique`/`revision`/`audit`). Durations land in the record's `phases[]` |
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

- **Accounts & private history** — sign in with Clerk; every report is owned by
  one user and history is scoped to them.
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
- **Tailwind CSS v4 UI** — dark-first design tokens, light theme via `prefers-color-scheme`, no hand-written component CSS.

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | Node 18+, Express 4, ES modules |
| Auth | Clerk (`@clerk/express`, `@clerk/react`) |
| Agents | Any OpenAI-compatible endpoint via the OpenAI SDK (`LLM_BASE_URL`) |
| Search | Tavily (`@tavily/core`) — search + full-page extraction |
| Storage | MongoDB Atlas via Mongoose (required) |
| Frontend | React 19, Vite 8, Tailwind CSS v4 |
| Report rendering | `react-markdown` + `remark-gfm`, `mermaid` for diagrams |

## Notes & limitations

- Reports are private per user, but there are no roles, sharing or teams yet.
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
