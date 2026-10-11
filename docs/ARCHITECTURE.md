# MAD Researcher — Architecture record

> **Status:** living document · **Scope:** the entire system (backend + frontend)
> **Audience:** anyone who has to run, extend, debug, or *argue with* this codebase.
> **Last verified against a live run:** see [§15 Verification](verification.md#15-verification-measured-not-asserted).

This document explains **what** the system does, **how** each part works, and — most
importantly — **why every non-obvious decision was made**, including the alternatives
that were rejected and the price paid for each choice. If you disagree with a decision,
every entry in [§16 The Decision Log](decisions.md#16-the-decision-log) tells you what it would cost
to change it.

---

## How this record is organised

The record is split by module so you can read the part you are changing without
wading through the rest. **Section numbers are unchanged from the single-file
original**, so a reference to "§7.4" or "ADR-25" still means exactly what it did —
it just lives in another file now, and the links below carry you there.

| Document | Covers | Sections |
| --- | --- | --- |
| **this file** | what the system is, its goals, context, stack, glossary | §1–§5, §21 |
| [backend.md](backend.md) | Backend | §6, §9, §10, §11, §12, §14, §17, §18 |
| [agents.md](agents.md) | Agent orchestration | §7, §8 |
| [frontend.md](frontend.md) | Frontend | §13 |
| [verification.md](verification.md) | Verification, performance and limitations | §15, §19, §20 |
| [decisions.md](decisions.md) | Decision log (ADRs) | §16 |
| [deployment.md](deployment.md) | Deployment proposal | §22 |

Every mechanical claim the record makes — cross-file links and anchors, §-numbers,
ADR numbers, env-var names and their documented defaults, API routes, report types,
file paths, and the completeness of the file map below — is re-checked against the
code by `node scripts/check-docs.mjs`, which exits non-zero when any one has drifted.

### Full section index

**This file**

- [1. What this is](#1-what-this-is)
- [2. Goals](#2-goals)
- [3. System context](#3-system-context)
- [4. The MERN claim, audited](#4-the-mern-claim-audited)
- [5. Stack choices and why](#5-stack-choices-and-why)
- [21. Glossary](#21-glossary)
- [22. Deployment proposal](deployment.md#22-deployment-proposal)
- [Appendix A — File map](#appendix-a--file-map)
- [Appendix B — Quick reference](#appendix-b--quick-reference)

**[backend.md](backend.md)**

- [6. Backend architecture](backend.md#6-backend-architecture)
- [9. The streaming protocol (SSE)](backend.md#9-the-streaming-protocol-sse)
- [10. The provider abstraction](backend.md#10-the-provider-abstraction)
- [11. Search: Tavily and normalisation](backend.md#11-search-tavily-and-normalisation)
- [12. Storage: the MongoDB facade](backend.md#12-storage-the-mongodb-facade)
- [14. Configuration and API reference](backend.md#14-configuration-and-api-reference)
- [17. Security & robustness](backend.md#17-security--robustness)
- [18. Failure modes](backend.md#18-failure-modes)

**[agents.md](agents.md)**

- [7. The agent pipeline](agents.md#7-the-agent-pipeline)
- [8. Prompt design](agents.md#8-prompt-design)

**[frontend.md](frontend.md)**

- [13. Frontend architecture](frontend.md#13-frontend-architecture)

**[verification.md](verification.md)**

- [15. Verification: measured, not asserted](verification.md#15-verification-measured-not-asserted)
- [19. Performance: where the time goes](verification.md#19-performance-where-the-time-goes)
- [20. Known limitations and honest gaps](verification.md#20-known-limitations-and-honest-gaps)

**[decisions.md](decisions.md)**

- [16. The decision log](decisions.md#16-the-decision-log)

---

## 1. What this is

A web application that takes a single research question and produces a **cited,
streamed, long-form analyst report** by orchestrating a six-phase pipeline of LLM "agents":

```
topic ─► PLAN ─► [ SEARCH ─► READ ─► EXTRACT ─► (GAP? ⟲) ] × N ─► DRAFT ─► CRITIQUE ─► REVISE ─► AUDIT ─► cited report
```

The distinguishing property is not that it calls a model — it's that the user
**watches the agents work**: planning, searching, reading, self-critiquing, and writing
appear in real time, every factual claim in the final report carries a numbered citation
that links to a source card, and the report is **audited for citation integrity** before it
is returned.

**One sentence of positioning:** *a transparent, self-hostable research assistant that
works with any LLM provider, authenticates its users, and refuses to start rather than
serve output it cannot ground.*

---

---

## 2. Goals

Each goal is an acceptance criterion with an observable test in the code:

| # | Goal | How it is met | Where |
|---|---|---|---|
| G1 | Multi-agent pipeline, not one giant prompt | 5 agent roles over 6 pipeline phases, each with its own prompt | `backend/src/agents/` |
| G2 | **Live** agent trace in the UI | Server-Sent Events, one event per unit of progress | `routes/research.js`, `useResearch.js` |
| G3 | Grounded citations | sources numbered at retrieval; claims carry `[n]` | `orchestrator.js`, `prompts.js` |
| G4 | Sources are inspectable | side panel with title, host, snippet, score | `SourcesPanel.jsx` |
| G5 | Export | copy, `.md`, print-to-PDF, `.docx` — all carrying sources | `ReportView.jsx`, `lib/export.js`, `lib/docx.js` |
| G6 | Durable, **private** persistence | MongoDB Atlas is the only store; startup fails without it | `db/mongoStore.js` |
| G7 | **No vendor lock-in** to OpenAI | OpenAI SDK used purely as a transport; any base URL | `llm.js`, `config.js` |
| G8 | Misconfiguration is loud, not silent | startup lists missing keys and `exit(1)` — no mock fallback | `config.js`, `index.js` |
| G9 | Real database | Mongoose adapter behind a facade; no file fallback | `db/mongoStore.js` |
| G10 | Real authentication, per-user data | Clerk session → `userId` scopes every read, write and delete | `app.js`, `routes/research.js`, `db/` |

---

---

## 3. System context

Who talks to what. Everything outside the dashed box is a third-party service the
operator supplies.

```mermaid
flowchart LR
    User(["User<br/>(browser)"]):::ext

    subgraph Client["Frontend — React + Vite :5173"]
        UI["SPA<br/>App.jsx"]
    end

    subgraph Server["Backend — Express + Node :5000"]
        API["REST + SSE<br/>routes/research.js"]
        ORCH["Orchestrator<br/>agents/orchestrator.js"]
        DBF["Storage facade<br/>db/index.js"]
    end

    subgraph Data["Storage"]
        MONGO[("MongoDB Atlas<br/>reports collection")]
    end

    LLM["Any OpenAI-compatible<br/>/v1/chat/completions endpoint"]:::ext
    TAV["Tavily Search API"]:::ext

    User -->|"HTTP"| UI
    UI -->|"POST /api/research/stream"| API
    API --> ORCH
    ORCH -->|"chat.completions"| LLM
    ORCH -->|"search"| TAV
    ORCH --> DBF
    DBF -->|"Mongoose"| MONGO

    classDef ext fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff;
```

**Reading it:** the frontend never talks to the LLM or Tavily directly — **API keys never
leave the server**. That is a hard architectural rule (see [§17](backend.md#17-security--robustness)).

---

---

## 4. The MERN claim, audited

"MERN" is often used loosely. Here is the honest mapping:

| Letter | Claimed | Actually used here | Verdict |
|---|---|---|---|
| **M** | MongoDB | Mongoose against MongoDB Atlas — the only storage driver | ✅ |
| **E** | Express | Express 4 + `cors` + `dotenv` | ✅ |
| **R** | React | React 19 + Vite 8 SPA | ✅ |
| **N** | Node.js | Node 20.19+ required — that floor is Vite 8's, not the backend's — developed and verified on Node 22, ESM (`"type": "module"`) | ✅ |

**The M is no longer partial.** MongoDB used to be an optional adapter behind a facade; it is
now the only store ([ADR-24](decisions.md#adr-24-delete-mock-mode-and-the-file-store)). Reports are
durable, queryable, and — because each carries its owner — private to a user
([ADR-23](decisions.md#adr-23-clerk-auth-with-owner-scoped-reports)). The facade in
[§12](backend.md#12-storage-the-mongodb-facade) remains, but its job changed: it is now the one
place that enforces owner scoping rather than the one place that picks a driver.

---

---

## 5. Stack choices and why

### 5.1 Backend dependencies (there are only seven)

| Package | Version | Why this and not something else |
|---|---|---|
| `express` | ^4.21 | Ubiquitous, well-understood, and — critically — gives direct access to the raw response object, which is what SSE needs. A meta-framework would add indirection for zero benefit in a six-route API. |
| `openai` | ^4.79 | Used **only** as an HTTP client for the `/v1/chat/completions` protocol. It handles streaming delta parsing, retries, and timeouts correctly. We never use an OpenAI account. See [ADR-01](decisions.md#adr-01-openai-sdk-as-transport-not-vendor). |
| `@tavily/core` | ^0.5.6 | Purpose-built for LLM research: returns cleaned, snippet-ready content rather than raw SERP HTML. See [§11](backend.md#11-search-tavily-and-normalisation). |
| `@clerk/express` | ^2.1 | Verifies the Clerk session on every request and attaches `req.auth`. Reports are owner-scoped, so "unauthenticated request" has to be impossible rather than merely unlikely. See [ADR-23](decisions.md#adr-23-clerk-auth-with-owner-scoped-reports). |
| `mongoose` | ^8.9 | Schema validation, `findOneAndUpdate` upserts, and connection management for the only store. See [ADR-24](decisions.md#adr-24-delete-mock-mode-and-the-file-store). |
| `cors` | ^2.8.5 | The SPA and API are separate origins (5173 vs 5000); CORS is required and was made explicit rather than `*`. |
| `dotenv` | ^16.4 | Reads `backend/.env`. Node 22 has `--env-file`, but `dotenv` works identically regardless of how the process is launched (including `node --watch`). |

**Notably absent:** any agent framework (LangChain, LlamaIndex, CrewAI, AutoGen). See
[ADR-02](decisions.md#adr-02-own-the-orchestration-no-agent-framework).

### 5.2 Frontend dependencies

| Package | Why |
|---|---|
| `react` 19 / `react-dom` | The host app; already present in the boilerplate. |
| `vite` 8 | Dev server with HMR in milliseconds; no config burden. |
| `@clerk/react` | Auth state, `getToken()` for the bearer header, and the sign-in UI. The only dependency that talks to a vendor from the browser. |
| `docx` | Builds the Word export. Lazily imported so its ~456 kB stays out of the main bundle unless someone exports. |
| `react-markdown` 9 + `remark-gfm` 4 | Renders model output as Markdown **without `dangerouslySetInnerHTML`**. See [ADR-14](decisions.md#adr-14-react-markdown-instead-of-innerhtml). |
| `tailwindcss` 4 + `@tailwindcss/vite` | Utility styling through the v4 Vite plugin — no `tailwind.config.js`, no PostCSS config. See [ADR-19](decisions.md#adr-19-tailwind-v4-for-styling). |
| `mermaid` 12 | Renders the report's ` ```mermaid ` blocks to SVG. Lazily imported so the library is code-split out of the main bundle. See [ADR-18](decisions.md#adr-18-client-side-mermaid-with-a-syntax-fallback). |

**Deliberately still absent:** any state library (React state is sufficient — see
[§13.1](frontend.md#131-state-machine)), any HTTP client (native `fetch` streams, which `axios`
historically handled worse), and any UI kit — the four primitives in `components/ui/`
are ~90 lines in total.

---

---

## 21. Glossary

| Term | Meaning here |
|---|---|
| **Agent** | An LLM call with a fixed role, a system prompt, and an expected output shape. We have five (planner, researcher, follow-up, critic, writer/reviser). |
| **Phase** | One of the six stages a run passes through: `plan`, `research`, `draft`, `critique`, `revision`, `audit`. Emitted as `phase` events and timed onto the record. |
| **Sub-question** | One searchable facet of the topic, produced by the planner — with an `intent` and a `theme`. |
| **Source** | A web result, deduped by URL and assigned a permanent citation number. |
| **Finding** | A single factual claim with a list of source numbers it came from, plus a confidence label. |
| **Extraction** | The researcher's full output for one sub-question: summary + findings + gaps + a `coverage` estimate. |
| **Coverage** | The researcher's own 0–100 estimate of how completely it answered a sub-question. Drives the gap-filling loop. |
| **Gap round** | An extra search-and-extract pass triggered because `coverage` fell below `COVERAGE_FLOOR`. |
| **Deep fetch** | Reading full page text (Tavily `extract`) rather than the ~800-char search snippet. |
| **Critique** | A typed, adversarial audit of the draft, produced by a separate LLM call. |
| **Revision** | The streamed rewrite that applies the critique. Replaces the draft; never appended to it. |
| **Citation audit** | A pure, model-free pass that verifies and sanitises every `[n]` in the final report. |
| **Integrity strip** | The UI row showing citation coverage, uncited count, removed citations, and the critique verdict. |
| **SSE** | Server-Sent Events — a one-way `text/event-stream` HTTP response. |
| **Frame** | One `data: …\n\n` unit in the SSE stream. |
| **Owner** | The Clerk `userId` a report belongs to. Stored as `ownerId`; every query filters on it. |
| **Session token** | The short-lived JWT the frontend gets from `getToken()` and sends as `Authorization: Bearer …`. |
| **Fail-fast** | Refusing to start when a required key is missing, instead of degrading to canned data. |
| **Neutral env var** | An `LLM_*` variable, as opposed to the legacy `OPENAI_*` fallbacks. |

---

---

## Appendix A — File map

```
backend/
  .env.example                     every setting, documented, incl. the depth/integrity block
  package.json                     7 dependencies, ESM, node --watch dev, node --test suite
  src/
    index.js                       bootstrap: validate config → connect Mongo → listen
    app.js                         Express app factory (Clerk middleware, CORS, routes, health)
    config.js                      env resolution, required-key validation, derived flags
    llm.js                         OpenAI-SDK transport: chatJSON / chatStream
    agents/
      orchestrator.js              the 6-phase pipeline; emits all 13 SSE event types;
                                   owns the gap loop, deep fetch, page-text Map
      planner.js                   topic → scope + themed sub-questions + title
      researcher.js                sub-question + sources → cited findings,
                                   coverage, confidence; needsFollowUp()
      followups.js                 gaps → new gap-targeted queries (dedupes alreadyAsked)
      critic.js                    draft → typed critique; hasMaterialIssues()
      citations.js                 pure: auditCitations() + sanitizeCitations()
      normalize.js                 shared asText()/asStrings() coercions for model JSON
      writer.js                    everything → streamed draft (writeDraft),
                                   draft + critique → streamed revision (reviseReport)
      sources.js                   the run's citation namespace: number a URL once, reuse it
                                   for later sub-questions (SourceIndex)
      prompts.js                   all prompt text (systems + per-format structures); zero logic
      reportTypes.js               the six selectable formats + resolveReportType()
    util/
      concurrency.js               bounded-concurrency pool (mapConcurrent) for the research phase
    services/
      search.js                    Tavily + normalisation + full-page extract
    routes/
      research.js                  auth guard; POST /stream (SSE), owner-scoped CRUD
    db/
      index.js                     storage facade; owner-scoped reads/writes
      mongoStore.js                Mongoose adapter (only store)
  test/                            node:test suite for the pure logic (`npm test`, 41 tests)
    citations.test.js              audit, sanitiser, and the list-indentation regression
    sources.test.js                numbering, cross-sub-question reuse, URL normalisation
    researcher.test.js             finding validation + what triggers another round
    concurrency.test.js            order, the concurrency limit, failure propagation
    critic.test.js                 critique normalisation and severity rules
    llm.test.js                    abort-signal composition + error translation
frontend/
  index.html                       entry: favicon, title, description, mounts /src/main.jsx
  vite.config.js                   react + @tailwindcss/vite plugins
  package.json                     react 19 / vite 8 / clerk / mermaid / docx; eslint 10 + jsdom (tests)
  eslint.config.js                 flat config (react-hooks + react-refresh)
  public/favicon.svg               the app icon (referenced by index.html)
  src/
    main.jsx                       createRoot + ClerkProvider
    api.js                         SSE POST-stream parser + REST helpers (Bearer token)
    index.css                      Tailwind import, theme tokens, .markdown styles
    hooks/useResearch.js           run lifecycle state machine
    App.jsx                        signed-out → Landing; signed-in shell, tabs, format state
    lib/
      cn.js                        class-name join helper
      citations.js                 shared [n] parsing; exports list the cited sources only
      mermaid.js                   repairs model-written diagrams before Mermaid parses them
      export.js                    .md download + print-to-PDF (with sources appendix)
      docx.js                      Markdown → .docx (headings/tables/images/sources)
      format.js                    hostOf / timeAgo / slugify / wordCount
    components/
      ui/
        Button.jsx                 primary / secondary / ghost button primitive
        Panel.jsx                  Panel + PanelHead surface primitives
        Badge.jsx                  small status pill
      QueryForm.jsx                input, examples, run/stop
      AgentTrace.jsx               phase badge, scope note, plan checklist, step trace
      Landing.jsx                  signed-out marketing page
      ReportView.jsx               meta, toolbar (copy/.md/PDF/DOCX),
                                   integrity strip, self-critique disclosure
      SourcesPanel.jsx             numbered source cards (#source-n anchors), dims uncited
      HistoryPanel.jsx             saved reports, open/delete
      Markdown.jsx                 GFM rendering + citation chips + mermaid hook
      Mermaid.jsx                  lazy SVG renderer with source fallback
  test/                            node:test suite for the pure frontend logic
    mermaid.test.js                every repair rule, asserted against the real Mermaid 12 parser
    citations.test.js              what counts as a citation, and which sources an export lists
    export.test.js                 the real print HTML and .docx bytes, checked for cited sources only
docs/                              the architecture record, split by module
  ARCHITECTURE.md                  index — what/why/stack, glossary, this map, quick reference
  agents.md                        §7–§8   the pipeline and every prompt
  backend.md                       §6, §9–§12, §14, §17–§18
  frontend.md                      §13     state machine, components, export, styling
  verification.md                  §15, §19–§20   measured runs, performance, limitations
  decisions.md                     §16     the 25 ADRs
  deployment.md                    §22     deployment options, recommendation, blueprint
scripts/
  check-docs.mjs                   fact-checks this record against the code (`node scripts/check-docs.mjs`)
```

---

## Appendix B — Quick reference

```bash
# backend
cd backend && cp .env.example .env    # then fill CLERK_*, MONGODB_URI, LLM_*, TAVILY_API_KEY
npm install && npm run dev            # http://localhost:5000

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

```bash
curl -s localhost:5000/api/health | jq          # public
# research routes need a Clerk session token:
curl -sN -X POST localhost:5000/api/research/stream \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"your topic"}' | head -40
```

---

*Every measured figure in this record came from live runs against a real LLM endpoint and
the real Tavily API. Claims that could not be verified in this environment are listed as such
in [§15.4](verification.md#154-what-could-not-be-verified). If you change a decision in
[§16](decisions.md#16-the-decision-log), update the entry rather than deleting it — the reasoning is the
asset.*
