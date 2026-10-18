<p align="center">
  <img src="frontend/public/favicon.svg" width="72" alt="MAD Researcher" />
</p>

<h1 align="center">MAD Researcher</h1>

<p align="center">
  <b>A deep-research agent that plans the investigation, searches the web, reads whole pages,<br />
  attacks its own draft — and hands you a cited report you can check.</b>
</p>

<p align="center">
  <a href="https://mad-researcher-web.onrender.com/"><img alt="Live demo on Render" src="https://img.shields.io/badge/live_demo-onrender-0e7c6b?style=for-the-badge" /></a>
</p>

<p align="center">
  <img alt="Node 20.19+" src="https://img.shields.io/badge/node-20.19%2B-339933?logo=nodedotjs&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black" />
  <img alt="Vite 8" src="https://img.shields.io/badge/vite-8-646CFF?logo=vite&logoColor=white" />
  <img alt="Tailwind v4" src="https://img.shields.io/badge/tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Express 4" src="https://img.shields.io/badge/express-4-000000?logo=express&logoColor=white" />
  <img alt="MongoDB Atlas" src="https://img.shields.io/badge/mongodb-atlas-47A248?logo=mongodb&logoColor=white" />
  <img alt="Clerk auth" src="https://img.shields.io/badge/auth-clerk-6C47FF" />
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3DA639" />
</p>

MAD Researcher is a MERN-stack platform for deep research. Sign in, ask a question, and a pipeline
of AI agents **plans** the investigation, **searches the web**, **reads pages in full**, fills its
own **gaps**, **drafts** a report, **critiques** that draft against its own sources, **revises** it,
and runs a **citation audit** before **streaming the finished report** back to your browser token by
token.

- **M**ongoDB Atlas — the report store; every report is private to its owner
- **E**xpress + Node backend running the agent pipeline
- **R**eact (Vite) frontend with a live agent trace, behind **Clerk** auth
- **N**ode.js 20.19+ (Vite 8's floor)

> **Live:** [mad-researcher-web.onrender.com](https://mad-researcher-web.onrender.com/) — running on
> **Render's free tier**, so the first request after 15 idle minutes waits about a minute for the
> API to wake. That cold start is the platform, not the app.

> 📐 **Architecture & decision record** — starts at [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
> (what the system is, its goals, its stack, and the file map), then splits by module:
> [agent orchestration & prompts](docs/agents.md) · [backend](docs/backend.md) ·
> [frontend](docs/frontend.md) · [measured verification & limitations](docs/verification.md) ·
> [the 27 ADRs](docs/decisions.md) · [deployment](docs/deployment.md).
> Read it before changing anything structural.

<details>
<summary><b>Contents</b></summary>

- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Setup](#setup)
- [Required keys](#required-keys)
- [Authentication (Clerk)](#authentication-clerk)
- [Bring your own model](#bring-your-own-model)
- [Storage: MongoDB Atlas](#storage-mongodb-atlas)
- [Configuration](#configuration)
- [API](#api)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Notes & limitations](#notes--limitations)

</details>

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

| Agent          | Job                                                                                                                                                                                                     | Model             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Planner**    | Decomposes the topic into a scope note, an intent, searchable sub-questions and a report title                                                                                                          | `LLM_MODEL_SMART` |
| **Researcher** | Searches Tavily per sub-question (and reads the strongest pages in full), returns cited findings plus a self-reported coverage/confidence score. Sub-questions run in parallel (`RESEARCH_CONCURRENCY`) | `LLM_MODEL`       |
| **Follow-ups** | Reads low-coverage findings and proposes targeted follow-up search queries (the gap-filling loop)                                                                                                       | `LLM_MODEL`       |
| **Writer**     | Synthesizes all findings into a streamed Markdown report with inline `[n]` citations, then rewrites it during revision                                                                                  | `LLM_MODEL_SMART` |
| **Critic**     | Audits the draft against its own sources — unsupported claims, citation errors, missing angles — and returns a verdict                                                                                  | `LLM_MODEL_SMART` |

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
│       │   ├── reportTypes.js   # the six selectable report formats
│       │   ├── normalize.js     # shared model-output coercions
│       │   └── prompts.js       # all prompt text (6 systems + format specs)
│       ├── services/search.js   # Tavily search + fetchPages (full-text extract)
│       ├── routes/research.js   # SSE + history endpoints (auth-guarded)
│       └── db/
│           ├── index.js         # storage facade (owner-scoped)
│           └── mongoStore.js    # MongoDB Atlas
├── docs/                      # the architecture record — start at docs/ARCHITECTURE.md
│   └── …                      # ARCHITECTURE · agents · backend · frontend · verification · decisions · deployment
├── scripts/check-docs.mjs     # fact-checks these docs against the code
├── render.yaml                # Render Blueprint: the two free services (docs/deployment.md)
└── frontend/
    ├── test/                    # node:test — diagram repair, citations, exports (npm test)
    └── src/
        ├── main.jsx             # createRoot + ClerkProvider + LazyMotion
        ├── App.jsx              # sign-in gate · trace · report · library
        ├── index.css            # Tailwind v4 + theme tokens + report styles
        ├── api.js               # SSE parser + REST calls (Bearer token)
        ├── hooks/useResearch.js # run lifecycle state machine (13 events)
        ├── lib/                 # format · citations · mermaid repair · export · docx · cn · motion
        └── components/
            ├── ui/              # Button · Panel · Badge · Mark · FadeBox · StatusPill · Reveal
            ├── Landing.jsx      # signed-out marketing page (hero · chapters · reveals)
            ├── QueryForm · AgentTrace · ReportView
            ├── SourcesPanel · HistoryPanel
            └── Markdown.jsx · Mermaid.jsx   # report rendering + diagrams
```

---

## Setup

### 1. Create the two accounts you need

| Service           | What for                              | Where                               |
| ----------------- | ------------------------------------- | ----------------------------------- |
| **Clerk**         | Sign-in and per-user report ownership | https://dashboard.clerk.com         |
| **MongoDB Atlas** | Storing reports                       | https://www.mongodb.com/cloud/atlas |
| **Tavily**        | Web search + full-page extraction     | https://app.tavily.com/home         |

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

### 4. Deploy

`render.yaml` at the repository root declares the whole app on Render's free tier — the API as a
web service, the SPA as a static site. See
[docs/deployment.md](docs/deployment.md#226-setup-in-the-order-that-avoids-rework) for the setup
order and the honest trade-offs: $0 means a Clerk *development* instance, a ~1 minute cold start
after the API sleeps, and a rate-limited LLM tier.

> **There is no mock mode.** If a required key is missing the backend prints the
> list and refuses to start, rather than silently serving canned data.

---

## Required keys

Grab each value, drop it in `.env`, and the backend will start.

| Variable                     | Where to get it                                                           |
| ---------------------------- | ------------------------------------------------------------------------- |
| `CLERK_PUBLISHABLE_KEY`      | Clerk Dashboard → **API keys** → Quick Copy                               |
| `CLERK_SECRET_KEY`           | Clerk Dashboard → **API keys** → Quick Copy (server-only)                 |
| `MONGODB_URI`                | Atlas → **Connect → Drivers** (paste your DB user's password in)          |
| `LLM_API_KEY`                | Your provider's dashboard — **any OpenAI-compatible provider**, see below |
| `TAVILY_API_KEY`             | https://app.tavily.com/home                                               |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same publishable key, in **`frontend/.env`**                              |

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

| Provider          | `LLM_BASE_URL`                                             | Example model                             |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Groq              | `https://api.groq.com/openai/v1`                           | `llama-3.3-70b-versatile`                 |
| OpenRouter        | `https://openrouter.ai/api/v1`                             | `anthropic/claude-3.5-sonnet`             |
| Together          | `https://api.together.xyz/v1`                              | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| DeepSeek          | `https://api.deepseek.com/v1`                              | `deepseek-chat`                           |
| Mistral           | `https://api.mistral.ai/v1`                                | `mistral-large-latest`                    |
| Google Gemini     | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash-lite`                   |
| Ollama (local)    | `http://localhost:11434/v1`                                | `llama3.1`                                |
| LM Studio (local) | `http://localhost:1234/v1`                                 | your loaded model                         |
| vLLM (local)      | `http://localhost:8000/v1`                                 | your served model                         |
| OpenAI (optional) | `https://api.openai.com/v1`                                | `gpt-4o-mini` / `gpt-4o`                  |

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

| Variable                     | Default                 | Purpose                                                                                                                 |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PORT`                       | `5000`                  | Backend port                                                                                                            |
| `CLIENT_ORIGIN`              | `http://localhost:5173` | CORS allow-list                                                                                                         |
| `CLERK_PUBLISHABLE_KEY`      | —                       | **Required.** Clerk publishable key                                                                                     |
| `CLERK_SECRET_KEY`           | —                       | **Required.** Clerk secret key (server-only)                                                                            |
| `MONGODB_URI`                | —                       | **Required.** Atlas connection string                                                                                   |
| `LLM_API_KEY`                | —                       | Your provider's key (use a placeholder for local servers)                                                               |
| `LLM_BASE_URL`               | *(empty)*               | Any OpenAI-compatible endpoint; empty = api.openai.com                                                                  |
| `LLM_MODEL`                  | `gpt-4o-mini`           | Researcher / follow-up model (cheap, called most often)                                                                 |
| `LLM_MODEL_SMART`            | `gpt-4o`                | Planner, writer and critic model                                                                                        |
| `LLM_JSON_MODE`              | `true`                  | Set `false` if your provider rejects `response_format=json_object`                                                      |
| `TAVILY_API_KEY`             | —                       | **Required.** Powers search **and** full-page extraction                                                                |
| `TAVILY_MAX_RESULTS`         | `6`                     | Sources per search (clamped 1–12)                                                                                       |
| `MAX_SUBQUESTIONS`           | `6`                     | Planner breadth (clamped 1–8)                                                                                           |
| `RESEARCH_DEPTH`             | `deep`                  | `deep` uses Tavily's advanced search; `quick` is faster/cheaper                                                         |
| `RESEARCH_MAX_ROUNDS`        | `2`                     | Extra gap-filling search rounds per sub-question (0–3; `0` disables)                                                    |
| `COVERAGE_FLOOR`             | `60`                    | Self-reported coverage (%) below which a gap round fires (0–100)                                                        |
| `MAX_FOLLOWUP_QUERIES`       | `2`                     | Follow-up queries the researcher may propose per gap round (0–4)                                                        |
| `DEEP_FETCH`                 | `true`                  | Read full page text for the strongest sources instead of snippets only                                                  |
| `DEEP_FETCH_SOURCES`         | `3`                     | Pages read in full per sub-question (0–8)                                                                               |
| `RESEARCH_CRITIQUE`          | `true`                  | Run the critic → revisor pass before saving                                                                             |
| `CRITIC_FULL_TEXT_SOURCES`   | `8`                     | Cited sources the critic reviews as full page text (0–16; `0` = snippets only)                                          |
| `RESEARCH_CONCURRENCY`       | `3`                     | Sub-questions researched in parallel (1–6)                                                                              |
| `RUN_TIMEOUT_MS`             | `900000`                | Hard ceiling on one run, in ms (1 min–1 h)                                                                              |
| `LLM_TIMEOUT_MS`             | `120000`                | Hard ceiling on one model request, in ms (5 s–10 min) — and the budget for a streamed answer's wait for its first token |
| `LLM_MAX_RETRIES`            | `2`                     | Retries after a timeout/failure (0–3; worst case ≈ `(retries + 1) × LLM_TIMEOUT_MS`)                                    |
| `LLM_STREAM_IDLE_TIMEOUT_MS` | `180000`                | How long a streamed answer may send nothing **between tokens** before it is cut off (5 s–10 min)                        |

To make runs much faster at the cost of depth, set `RESEARCH_MAX_ROUNDS=0`,
`DEEP_FETCH=false` and `RESEARCH_CRITIQUE=false`.

### Stalls, timeouts and stopping

A run has hard ceilings at every level, because a model provider that accepts a
request and then says nothing is indistinguishable from a slow one:

- **Stopping a run stops the work.** The client's abort travels to the backend
  over the SSE connection, which aborts the model and search calls in flight.
  A stopped run is reported as a partial draft in the UI — no critique, no
  citation audit — rather than presented as finished.
- **The streamed writer gets two budgets, not one.** The OpenAI SDK clears its
  own timeout as soon as response *headers* arrive, so a stream that opens and
  then goes quiet is otherwise unbounded, and a single "silence" number would
  conflate two different waits. `LLM_TIMEOUT_MS` covers the wait for the *first*
  token — prompt processing, which on a revision means a prompt holding the whole
  draft — and `LLM_STREAM_IDLE_TIMEOUT_MS` covers silence *between* tokens, where
  normally milliseconds pass. Any frame re-arms the watchdog, so a
  slow-but-progressing report is never cut off, however long it takes; only real
  output moves it onto the tighter number.
- **A stall is a failure, not a short report.** A stream the watchdog cuts off
  raises: a stalled *revision* keeps the draft, and a stalled *draft* ends the run
  with an `error` frame and nothing saved. That is the honest version of the
  previous behaviour, where the partial text came back as if it had finished and
  was persisted as a complete report — the price being that a stalled draft now
  loses the research behind it
  ([§20](docs/verification.md#20-known-limitations-and-honest-gaps) row 21).
- **An empty response is an error, not an empty report.** Some reasoning models
  spend their entire budget thinking and return zero content tokens
  (`finish_reason: "length"`); that is reported by name, with the model, instead
  of being parsed as `{}` and quietly producing an empty plan or report.
- **`RUN_TIMEOUT_MS`** is the backstop: it stops the run and tells the client
  why, so no combination of slow provider and slow search can hold an SSE
  connection open indefinitely.

The frontend reads `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` from
`frontend/.env` (see `frontend/.env.example`).

---

## API

All research routes require a Clerk session (`Authorization: Bearer <token>`).

| Method   | Route                  | Auth   | Description                                                                              |
| -------- | ---------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`          | public | Mode, storage driver, models, depth knobs, missing keys                                  |
| `POST`   | `/api/research/stream` | ✅      | Run the pipeline, stream SSE events. Body: `{ "query": "...", "reportType": "analyst" }` |
| `GET`    | `/api/research/types`  | ✅      | The selectable report formats (metadata only — no prompt text)                           |
| `GET`    | `/api/research`        | ✅      | The caller's report history (newest first, summaries)                                    |
| `GET`    | `/api/research/:id`    | ✅      | Full stored report (only if the caller owns it)                                          |
| `DELETE` | `/api/research/:id`    | ✅      | Delete one of the caller's reports                                                       |

**SSE event types** (each frame is `data: {...}`) — 13 in total:

| Event          | Payload                                                                           | Purpose                                                                                                               |
| -------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `meta`         | `{ query, model, smartModel, depth, critique, deepFetch, maxRounds, reportType }` | Run begins; reports the active model, depth settings and chosen format                                                |
| `phase`        | `{ phase }`                                                                       | Entering a phase (`plan`/`research`/`draft`/`critique`/`revision`/`audit`). Durations land in the record's `phases[]` |
| `status`       | `{ message }`                                                                     | Human-readable progress line                                                                                          |
| `plan`         | `{ title, scope, subQuestions }`                                                  | Planner output                                                                                                        |
| `step`         | `{ step }`                                                                        | Fine-grained agent trace entry                                                                                        |
| `sources`      | `{ sources, total }`                                                              | Newly discovered sources                                                                                              |
| `findings`     | `{ subQuestion, extraction }`                                                     | Cited findings (with coverage/confidence)                                                                             |
| `token`        | `{ text }`                                                                        | A streamed chunk of the report                                                                                        |
| `critique`     | `{ critique }`                                                                    | The critic's verdict + issues                                                                                         |
| `report-reset` | `{}`                                                                              | Discard the draft shown so far — a revision is about to stream                                                        |
| `audit`        | `{ audit }`                                                                       | Citation audit: coverage, uncited, invalid, removed                                                                   |
| `done`         | `{ record }`                                                                      | Final persisted record                                                                                                |
| `error`        | `{ message }`                                                                     | Terminal failure                                                                                                      |

---

## Features

- **Six report formats** — pick the deliverable before you run: analyst report,
  executive brief, comparison, timeline, risk assessment, or evidence review. Each
  one changes the report's **structure and writing stance**, not just its length —
  a risk register and a chronology answer different questions about the same topic.
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
- **Live agent trace** — a live step indicator, per-agent steps, and the critic's issues
  appear as they happen, so a multi-minute run never looks frozen.
- **Honesty in the UI** — an integrity strip and a self-critique panel surface the
  audit numbers and the critic's verdict instead of hiding them.
- **Mermaid diagrams in the report** — the writer embeds ```` ```mermaid ```` flowcharts/timelines where they
  clarify a process, and the UI renders them as SVG. Diagrams the model gets syntactically wrong
  (Unicode or single-dash arrows, unquoted parentheses in labels, prose lines such as
  `A vs. B`) are repaired before they are parsed, so the diagram the prose refers to is the
  diagram you see; anything the repair cannot
  rescue still falls back to showing its source rather than breaking the report.
- **Citations & sources panel** — inline `[n]` markers become clickable chips that scroll to the matching source card.
- **Export** — copy as Markdown, download `.md` (repairable diagrams preserved as code), download **Word `.docx`** (real headings, tables, and diagrams rasterised to images), or print/save as **PDF**. All three files carry a **Sources appendix** listing only the sources the report actually cites, so every entry resolves to a `[n]` in the text and vice versa.
- **A warm, editorial UI** — Tailwind v4 with the whole palette and type scale in one token block: an ink-on-paper base, a single teal accent, amber for annotations, and `Fraunces` / `Newsreader` / `Public Sans` for display, report prose and UI. **Light, dark or system** from the header, remembered across visits and applied before first paint. The report reads like a document rather than a dashboard, long streams fade and blur at the edge instead of snapping shut, and the landing assembles itself on scroll (`motion`).

## Tech stack

| Layer            | Choice                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Backend          | Node 20.19+ (Vite 8's floor), Express 4, ES modules                |
| Auth             | Clerk (`@clerk/express`, `@clerk/react`)                           |
| Agents           | Any OpenAI-compatible endpoint via the OpenAI SDK (`LLM_BASE_URL`) |
| Search           | Tavily (`@tavily/core`) — search + full-page extraction            |
| Storage          | MongoDB Atlas via Mongoose (required)                              |
| Frontend         | React 19, Vite 8, Tailwind CSS v4                                  |
| Animation        | `motion` — the landing's scroll reveals only (code-split)          |
| Report rendering | `react-markdown` + `remark-gfm`, `mermaid` for diagrams            |

## Notes & limitations

- Reports are private per user, but there are no roles, sharing or teams yet.
- Diagrams are repaired, not guaranteed. The repair covers the fault classes measured against
  Mermaid 12 (see `frontend/test/mermaid.test.js` and [§13.6](docs/frontend.md#136-mermaid-diagrams-in-the-report));
  a diagram outside them still shows its source instead of rendering.
- Tavily is the only search provider wired in; add another by extending `backend/src/services/search.js`.
- Depth costs latency: a full live run (gap rounds + critique + revision) takes
  **~2–3 minutes**, versus ~40 s for the original single-pass pipeline. The
  dials in the config table above trade it back — `RESEARCH_CONCURRENCY` is the
  biggest lever, since the research phase is ~85 % of a run and is almost all
  network wait.
- A failed critic or revisor no longer discards the run: the draft is still
  citation-audited and saved, and the trace says the critique pass failed. Only a
  failed plan or draft is fatal.
- The critic is the same model family as the writer, so it shares their blind
  spots — it is a useful second pass, not an independent adjudicator.
- Deep fetch only pulls the top-ranked URLs per sub-question; long pages are
  truncated (currently ~6,000 chars) before extraction.
- Any OpenAI-compatible LLM works via `LLM_BASE_URL` — but quality varies. Very small local models may produce malformed JSON or weak citations; `LLM_JSON_MODE=false` plus a larger model helps. A JSON answer that comes back as prose is re-asked once before the call fails.
- Some reasoning models spend their whole budget thinking and return **no content at all** (`finish_reason: "length"`, `0` completion tokens). That is reported as an empty-response error naming the model, rather than silently producing an empty plan or report — if you see it, check `LLM_MODEL` / `LLM_MODEL_SMART` against your provider's catalogue and prefer a non-reasoning model for those tiers.
