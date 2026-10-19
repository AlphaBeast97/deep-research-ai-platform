# MAD Researcher — Decision log (ADRs)

> Part of the [architecture record](ARCHITECTURE.md). Section numbers are the
> originals from the single-file version, so existing references still resolve.

---

## 16. The decision log

Each entry: the decision, what was rejected, why, and what it costs.

### ADR-01: OpenAI SDK as transport, not vendor

- **Decision:** use `openai` npm purely as an HTTP client for `/v1/chat/completions`, pointed at `LLM_BASE_URL`.
- **Rejected:** Writing raw `fetch` calls; or assuming an OpenAI account.
- **Why:** the SDK correctly handles streaming delta accumulation, retries, and error shapes — genuinely non-trivial code we don't want to own. The protocol is a de-facto standard.
- **Cost:** a package named "openai" appears in `package.json`. This is cosmetic: `config.js` never requires an OpenAI key or default model. **Explicitly stated because it caused friction** — see the provider-neutral naming in [§10.2](backend.md#102-how-the-environment-resolves).
- **Since:** one wait the SDK does **not** own turned out to matter — a stream that goes quiet after its headers, which the SDK's request timeout has already stopped watching — and neither does the fact that aborting such a stream does not arrive as an error. Both are now ours, explicitly: see [ADR-26](#adr-26-two-budgets-for-a-streamed-answer).

### ADR-02: Own the orchestration, no agent framework

- **Decision:** hand-write the planner/researcher/writer loop.
- **Rejected:** LangChain, LlamaIndex, CrewAI, AutoGen.
- **Why:** the pipeline is a `for` loop over sub-questions plus three prompt calls. A framework would add hundreds of transitive dependencies, obscure the exact request/response shapes, make streaming-through-SSE harder to control, and introduce its own version churn — all to replace ~60 lines we fully understand.
- **Cost:** we implement retries/telemetry ourselves if we want them later.

### ADR-03: Layer by systems touched, not by feature

- **Decision:** `agents/` (LLM) and `services/` (external APIs) are separate; `prompts.js` holds only strings.
- **Rejected:** grouping by feature (e.g. `research/planner-with-search.js`).
- **Why:** the two axes of change are "which model/prompt" and "which data source". Separating them means each change is local and the blast radius is obvious.
- **Cost:** slightly more files than a single-module design.

### ADR-04: POST SSE with hand parsing

- **Decision:** stream over a POST response body and parse `data:` frames in `api.js`.
- **Rejected:** `EventSource` + GET (no body); WebSockets (bidirectional, overkill); polling.
- **Why:** we need one-way progress with a JSON request body and cancellability. Full detail in [§9.1](backend.md#91-transport-choice).
- **Cost:** no browser auto-reconnect; ~30 lines of buffer-splitting that must respect chunk boundaries.

### ADR-05: A nine-event vocabulary rather than raw text only

- **Decision:** emit typed events (`meta/status/plan/step/sources/findings/token/done/error`) alongside tokens.
- **Rejected:** streaming only the report text.
- **Why:** the product's differentiator is *transparency*. Typed events let the UI render a plan checklist, a per-source panel, and an agent trace — none of which is derivable from report text alone.
- **Cost:** a wider contract between backend and frontend; every new event type needs a client `case`.
- **Since:** the vocabulary has grown to thirteen — `phase`, `critique`, `report-reset` and `audit` were added as the UI learned to show a phase badge, the self-critique, and the integrity strip. The decision is unchanged; the cost line is what grew ([§9.3](backend.md#93-event-taxonomy)).

### ADR-06: Pass model names through unvalidated

- **Decision:** `LLM_MODEL` goes verbatim to the provider.
- **Rejected:** a validation/mapping table of known model names.
- **Why:** any such table is stale within weeks, and it would silently rewrite names instead of surfacing typos. Providers are the source of truth.
- **Cost:** demonstrated by the 404 incident in [§15.2](verification.md#152-the-model-id-incident-the-reason-this-trade-off-gets-a-whole-section). Mitigated by reporting resolved models in `/api/health` and the boot banner.

### ADR-07: Two model tiers with an implicit fallback

- **Decision:** `LLM_MODEL` (researcher) and `LLM_MODEL_SMART` (planner/writer), the latter defaulting to the former.
- **Rejected:** one model everywhere; or a mandatory second setting.
- **Why:** cost scales with call count — the researcher is called N times. Defaulting keeps single-model providers working.
- **Cost:** operators must understand which agent uses which tier (documented in the README table and [§7.1](agents.md#71-the-pipeline-in-six-phases)).

### ADR-08: Tavily behind a normalising wrapper

- **Decision:** `services/search.js` exposes `webSearch()` returning a fixed `{title,url,snippet,score}` shape.
- **Rejected:** calling Tavily directly from the researcher agent.
- **Why:** normalisation protects against missing titles, whitespace blowup, and prompt-flooding; it also makes the search provider swappable in one file.
- **Cost:** any Tavily field we don't map is unavailable upstream (intentional).

### ADR-09: File store as default; database optional

> **Superseded by [ADR-24](#adr-24-delete-mock-mode-and-the-file-store).** The reasoning was
> right for a single-operator demo and wrong once reports belong to accounts.

- **Decision:** ship a JSON file store as default; provide a full Mongo adapter one env var away.
- **Rejected:** requiring MongoDB to start.
- **Why:** zero-setup onboarding (the goal then numbered **G6** — the current G6 is durable, private persistence). A developer must be able to clone, `npm install`, `npm run dev` and see the product work — no cloud account, no connection string.
- **Cost:** the "MERN" claim is only true in the configured sense. Fully mitigated by the facade ([ADR-11](#adr-11-storage-facade)). The file store also rewrites the whole document on each save — fine for a single user, not for scale ([§20](verification.md#20-known-limitations-and-honest-gaps)).

### ADR-10: Fail fast on storage init failure

- **Decision:** if `initStorage()` throws, log and `process.exit(1)`.
- **Rejected:** falling back to a local store (or to canned data) when Mongo is unreachable.
- **Why:** silent fallback is a data-integrity trap — the connection fails and the app quietly writes reports somewhere the operator will never look. This now applies to *every* required key, not just storage ([ADR-24](#adr-24-delete-mock-mode-and-the-file-store)). A loud failure is the honest behaviour.
- **Cost:** no automatic resilience; the operator must fix `MONGODB_URI`.

### ADR-11: Storage facade

- **Decision:** all consumers import `db/index.js`; it owns the Mongoose store and the owner-scoping.
- **Rejected:** importing the concrete store at each call site.
- **Why:** the facade is now the single place that enforces `ownerId` scoping, so no route can accidentally query across users ([ADR-23](#adr-23-clerk-auth-with-owner-scoped-reports)). It previously also made the driver swappable; with the file store gone ([ADR-24](#adr-24-delete-mock-mode-and-the-file-store)) that benefit is moot, but the scoping benefit is larger.
- **Cost:** one indirection layer.

### ADR-12: Flatten plan into `subQuestions` on persist

- **Decision:** the stored record contains `subQuestions: [String]`, not the live `plan` object.
- **Rejected:** persisting the full `{title, subQuestions:[{question,intent}]}` plan.
- **Why:** the persisted document should be narrow and stable. `intent` guides the writer at generation time and is not needed to re-render a history entry. Arrays of strings index and validate cleanly in Mongo.
- **Cost:** *this was briefly mistaken for a bug* during verification — reading `record.plan` returned `{}` because the field is named `subQuestions`. Documented here so the next person doesn't "fix" a non-bug. The frontend maps it back: `(record.subQuestions ?? []).map(q => ({ question: q }))`.

### ADR-13: Citations inline; no reference list

- **Decision:** the writer emits `[n]` inline and is explicitly told not to append a references section.
- **Rejected:** letting the model produce its own bibliography.
- **Why:** the UI renders a canonical, always-correct source list from the actual retrieved data. A model-authored bibliography would duplicate it, could drift from the real sources, and would waste output tokens.
- **Cost:** the report is only self-contained inside this app; a raw copy-paste loses the reference list. Acceptable — the exports carry an appendix (see *Since*), and the sources panel is the source of truth.
- **Since:** the exports (`.md`, PDF, `.docx`) append a Sources appendix so the inline markers resolve in the saved file, and it lists **only the sources the report cites** — `citedSources()` in `lib/citations.js`, using the same citation pattern that renders the chips. A source the report never references is evidence the *run* gathered, which belongs in the panel, not in a document someone keeps. Numbers are never renumbered, so the appendix keeps the numbers the report's markers use ([§13.5](frontend.md#135-export)). The `.md` appendix was added later than the other two: the `.md` had been left as "just the report", which meant its `[n]` markers pointed at a list that was not in the file.

### ADR-14: `react-markdown` instead of `innerHTML`

- **Decision:** render model output with `react-markdown` + `remark-gfm`.
- **Rejected:** `dangerouslySetInnerHTML` with a Markdown→HTML converter.
- **Why:** the rendered content is **untrusted** — it is model output that describes **third-party web content**. Injecting that as raw HTML is a direct XSS vector. `react-markdown` builds React elements and never executes markup.
- **Cost:** one dependency; some HTML in Markdown isn't rendered. Worth it — this is the security boundary of the app.

### ADR-15: Registration-free, single-user, global history

> **Superseded by [ADR-23](#adr-23-clerk-auth-with-owner-scoped-reports).** Auth is now required.

- **Decision:** no authentication.
- **Rejected:** accounts, sessions, per-user scoping.
- **Why:** scoped explicitly as a local/single-operator tool. Auth would dominate the codebase and the setup instructions for no benefit to the stated use case.
- **Cost:** history was global and the API was open, which is exactly why this entry is superseded: [ADR-23](#adr-23-clerk-auth-with-owner-scoped-reports) makes a session mandatory and scopes every query to its owner. The exposure this entry accepted no longer exists.

### ADR-16: Automatic mock mode

> **Superseded by [ADR-24](#adr-24-delete-mock-mode-and-the-file-store).** Mock mode is removed.

- **Decision:** when the LLM or Tavily is unconfigured, run the *real* pipeline with canned data.
- **Rejected:** refusing to start, or returning an error.
- **Why:** it makes the product demonstrable in seconds, gives the frontend a stable fixture, and doubles as a test harness. The mock streams through the same SSE path, so it exercises the whole stack.
- **Cost:** a user could mistake mock output for research — mitigated by the `Mock mode` badge, the in-report warning banner, and `[mock]` source titles.

### ADR-17: Heartbeat + closed flag

- **Decision:** `: ping` every 15 s; a `closed` flag guarding all writes.
- **Rejected:** relying on the connection staying open.
- **Why:** measured runs exceed 40 s with multi-second gaps ([§19](verification.md#19-performance-where-the-time-goes)); idle proxies would drop them. And writing to a client that navigated away would throw.
- **Cost:** one interval timer per active run — negligible.

### ADR-18: Client-side Mermaid with a syntax fallback

- **Decision:** render ```` ```mermaid ```` blocks in the browser, debounced, with a hard fallback to the raw source when parsing fails.
- **Rejected:** `rehype-mermaid` (needs a headless browser at build time), server-side pre-rendering to SVG (adds latency and a charting dependency to the write path), and skipping diagrams entirely.
- **Why:** it leaves the ~42 s critical path unchanged, keeps the backend free of a charting library, and the fallback turns a bad diagram into a cosmetic problem instead of a blank report.
- **Cost:** a few kB of wiring plus Mermaid's own lazily-fetched chunks. See [§13.6](frontend.md#136-mermaid-diagrams-in-the-report).
- **Since:** the fallback is no longer the *first* line of defence. A real report shipped a flowchart the parser rejected — a Unicode arrow in edge position (a lexical error) and an unquoted `(2020-2022)` in a label (a parse error), two independent faults — so `lib/mermaid.js` now repairs the shapes the parser was measured to reject before rendering, and again in the `.md` export. The rules are narrow (only what the parser rejected; `%`, `,` and `&` are left unquoted, because Mermaid accepts them in flowcharts) and verified against the real parser in `frontend/test/mermaid.test.js`. One punctuation rule is format-specific rather than general: in a `timeline`, `:` separates the period from the event, so a colon inside event text silently becomes a second event. That is stated in the prompt ([ADR-31](#adr-31-each-format-owns-its-diagram-requirement)) rather than repaired in `lib/mermaid.js`, because a repair cannot tell which side of the colon was meant to be the event. The fallback stays for anything the repair cannot rescue, and it shows the *repaired* source so the two never disagree.

### ADR-19: Tailwind v4 for styling

- **Decision:** replace `App.css` and most of `index.css` with Tailwind v4 utilities, with the theme expressed as `@theme inline` tokens.
- **Rejected:** hand-written CSS (already drifting), a component kit such as MUI or Chakra (a large dependency for six components), CSS modules (more files, no token system).
- **Why:** utility classes remove dead CSS by construction, and routing the existing `--c-*` palette through `@theme inline` preserves the dark/light theming that was already there.
- **Cost:** class-heavy JSX, plus one unlayered `.markdown` stylesheet for `react-markdown` output. See [§13.7](frontend.md#137-styling-tailwind-v4).

### ADR-20: App factory separate from bootstrap

- **Decision:** `app.js` exports `createApp()`; `index.js` initialises storage, builds the app, and listens.
- **Rejected:** the single `index.js` this started as.
- **Why:** importing a module must not bind a port or touch storage as a side effect. The factory makes the app importable and testable, and keeps the storage-failure exit ([ADR-10](#adr-10-fail-fast-on-storage-init-failure)) in the bootstrap where it belongs.
- **Cost:** one extra file and one extra hop when tracing startup — a good trade.

### ADR-21: The revision is gated on actionable findings, not the verdict

- **Decision:** when `RESEARCH_CRITIQUE=true`, the revision pass runs only when the critique
  names work the revisor can do — at least one issue with a stated fix
  (`actionableIssues`), or a citation problem. The verdict is stored and displayed, but it
  never gates the pass on its own.
- **Rejected:** two coarser gates: skipping on `verdict === 'solid'` (the original design),
  and running unconditionally (the one after it).
- **Why:** the original gate was **wrong in practice, not merely in theory.** In the first
  measured live run the critic returned `verdict: "solid"` *and* two issues, one of them a
  real uncited claim — and the pipeline skipped the revision entirely because of the verdict.
  A model's one-word summary of its own review is the least trustworthy part of that review;
  the typed issue list is the trustworthy part. Running unconditionally overcorrected: a
  clean audit then bought a full smart-model call that had no page text of its own to check
  against, so it could only drift or invent detail. Gating on the issue list fixes the
  original bug without paying for a pass with nothing to apply.
- **Cost:** a genuinely clean draft now ships without a second streamed pass. That is the
  intent, and the ~6 s plus tokens are spent only when the audit found something to fix. A
  revision that does run still tells the client to clear the report (`report-reset`).
- **Safety net:** if the revision call fails, or its output fails the fact-level gate, the
  draft is kept and `revised: false` is recorded with the reason — an improvement step may
  never make the output worse ([ADR-29](#adr-29-the-revision-is-judged-on-facts-not-length)).

### ADR-22: Sanitise citations instead of only reporting them

- **Decision:** `auditCitations` finds unresolvable `[n]` references, and `sanitizeCitations`
  **removes** them (preserving valid comma-lists), then the report is re-audited to record
  how many were removed.
- **Rejected:** reporting `invalid[]` to the UI and leaving the text untouched.
- **Why:** a citation chip that points nowhere is worse than plain text, because it *looks
  like evidence* and survives export to Markdown/PDF where the UI that would have revealed it
  is gone. The audit is a pure function with no model in the loop, so there is no downside to
  acting on its finding rather than merely displaying it.
- **Cost:** the sanitised report differs slightly from what the model wrote — a `[37]` that
  pointed at nothing becomes nothing. This is deliberate and is why `invalidRemoved` is
  surfaced in the integrity strip rather than hidden.

### ADR-23: Clerk auth with owner-scoped reports

- **Decision:** authenticate with Clerk. `clerkMiddleware()` verifies a session on every
  request; every `/api/research*` route requires one; each saved report carries the owner's
  Clerk `userId`, and every read, list and delete filters on it.
- **Rejected:** rolling our own sessions (password hashing, reset flows, token rotation —
  a large security surface for no product benefit); leaving the tool single-user (ADR-15).
- **Why:** reports are private user data, and "private" has to be enforced in the query, not
  the UI. Scoping in `db/index.js` means a whole class of bug — forgetting to filter — cannot
  happen at a call site. Clerk also gives us a maintained sign-in UI and the server-side
  verification path for free.
- **Why not session cookies:** the UI (`:5173`) and API (`:5000`) are different origins, so a
  cookie would need `SameSite`/credentials gymnastics. A short-lived bearer token from
  `getToken()` is simpler and works identically in dev and production.
- **Cost:** two more required secrets, a third-party dependency on the critical path, and a
  real deployment step (claim the Clerk app, switch to production keys). Requests without a
  valid session now fail with `401` rather than returning global data.

### ADR-24: Delete mock mode and the file store

- **Decision:** remove mock mode and the JSON file store entirely. Missing configuration is a
  **startup failure** (`missingKeys()` → print → `exit(1)`), not a degraded run.
- **Rejected:** keeping mock mode as a demo/offline path; keeping the file store as a dev
  fallback.
- **Why:** mock mode was a *liability* once auth and private reports landed. Canned data has no
  owner, so it can't satisfy the ownership invariant — and its presence made "is this real?"
  a question the code had to keep answering (badges, warning banners, `mock` fields in the
  event stream, the health payload, and the stored record). Deleting it removes a whole
  parallel code path from the orchestrator, the search service, the LLM client, the config and
  the UI. The file store had the same problem: a silent second store is a data-integrity trap,
  and it cannot represent per-user ownership cleanly.
- **Cost:** there is no zero-config demo any more. Cloning the repo now means creating a Clerk
  app and an Atlas cluster before the server will boot. That is a real loss and is bought back
  deliberately: the failure message names exactly what is missing, so the fix is one command
  away, and the product never lies about whether output is real research.

### ADR-25: Six selectable report formats

- **Decision:** the user picks the deliverable before running — analyst report, executive
  brief, comparison, timeline, risk assessment, or evidence review. Each format is a distinct
  section structure, a distinct writing stance and a distinct **length ceiling**, and it drives
  the writer, revisor and critic prompts for the run. The choice is stored on the report so it
  can be labelled on reload.
- **Rejected:** one universal report with a "length" or "tone" knob; and letting the user
  supply a free-form format prompt.
- **Why:** the questions people actually ask are not all the same shape. "Which of these two
  is better?" wants a comparison table and a verdict; "what happened, in what order?" wants a
  chronology with dated entries. Forcing either into the analyst template answers the question
  badly, and no amount of tuning on one template fixes that — the *structure* is the problem,
  not the prose. A small closed set keeps output predictable and lets each format be tuned and
  tested on its own. Free-form format prompts were rejected because they make the output
  impossible to reason about and hand unbounded text a privileged position in the prompt.
- **How it holds together:** `prompts.js` stays string-only — the per-format structures are
  plain exports, and the writer/revisor system prompts became functions that interpolate one.
  The shared length, detail, citation and diagram rules are factored into `SHARED_RULES` so
  every format
  inherits them; a format cannot silently drop the citation rules. The diagram requirement
  itself is the format's, not the shared block's — how many diagrams, and of what type, is
  a property of the deliverable ([ADR-31](#adr-31-each-format-owns-its-diagram-requirement)).
  Only `{id,label,blurb}`
  crosses to the browser — the prompt text never leaves the server. An unknown or absent id
  resolves to the default rather than reaching a prompt as `undefined`, and an explicitly
  invalid id in the API body is rejected with `400`.
- **Cost:** six structures to keep in sync with what the critic expects. That cost is bounded
  by the same single-string rule: the critic is told which format was requested and audits
  against *that* spec, so its `structure` check — the required sections, tables and diagrams —
  moves whenever the format moves ([§8.5](agents.md#85-the-critic-prompt)). Length is
  deliberately excluded from that check: the range is a ceiling the writer may stop under.

---

### ADR-26: Two budgets for a streamed answer

- **Decision:** a streamed call is bounded by two clocks, not one. `LLM_TIMEOUT_MS` covers the
  wait for the **first** token — prompt processing, which on a revision means a prompt carrying
  the whole draft — and `LLM_STREAM_IDLE_TIMEOUT_MS` covers silence **between** tokens. The
  watchdog is armed once the headers land (before that the SDK's own timeout is still watching),
  every frame re-arms it because any frame proves the provider is alive, and only real output —
  content, or a provider's reasoning deltas — switches it from the first budget to the second. A
  stall is reported as an error, and it is re-asserted *after* the stream ends as well as in the
  `catch`, because aborting a stream does not reliably arrive as one.
- **Rejected:** raising the single idle number, which was the first fix attempted. It makes a
  working-but-slow model survive only by making a dead one hold the run for the same long
  window, and it keeps charging the first-token wait to a number meant for gaps that are
  normally milliseconds. Also rejected: retrying a stalled stream, which cannot work — a stream
  that dies after the headers is already past the SDK's retry loop, and a retry replays a prompt
  the size of a report.
- **Why:** one number cannot describe two waits that differ by orders of magnitude, and getting
  it wrong is expensive in both directions: too tight and a *thinking* model is reported as
  unavailable on the last phase of a run that already spent minutes on searches and
  extractions; too loose and a genuinely dead provider holds the connection. The failure that
  prompted this was a revision cut off at 60 s on a reasoning model whose prompt held the entire
  draft — the longest prompt in the system. Measured after the split: 7 s to first token under a
  5 s idle budget threw at 5.4 s with one budget and answers at 7.4 s with two
  ([§15.5](verification.md#155-the-stall-watchdog-measured)).
- **Cost:** two knobs and a small state machine instead of one number, and a longer blind window
  between tokens (180 s by default, up from 60 s). The more consequential cost is the honesty it
  buys: a stalled **draft** now ends the run instead of persisting a truncated report as
  complete, so the research behind it is lost — recorded as
  [§20](verification.md#20-known-limitations-and-honest-gaps) row 21, alongside the fix sketch
  that would soften it (one retry).

---

### ADR-27: `motion` for the landing animations

- **Decision:** add one animation library, `motion` (v14), and use it **only on the signed-out
  landing** — the scroll reveals for the hero, the feature band and the six-phase chapters. It is
  used through `m` + `LazyMotion` with the `domAnimation` feature set, and the feature set is a
  dynamic import (`lib/motionFeatures.js`), so it lands in its own chunk.
- **Rejected:** keeping the hand-rolled `IntersectionObserver` + CSS-transition `Reveal`; a
  component kit (MUI/Chakra); an in-house spring/timeline implementation.
- **Why:** the hand-rolled version worked but is a small animation engine to own — no staggering,
  no spring physics, no gesture support — and every further motion idea meant writing more of it.
  A component kit is the wrong tool: nothing in MUI or Chakra ships a "six-phase journey", and its
  design language would have to be overridden on every screen ([ADR-19](#adr-19-tailwind-v4-for-styling)
  already rejected one). `motion` is the one library that replaces custom code rather than adding
  surface we do not use.
- **Cost, measured:** the main bundle grew from **559.83 kB to 597.79 kB** (gzip 167.92 → 181.14),
  with the feature set in a separate **38.17 kB / 14.65 kB gzip** chunk — about **28 kB gzip
  total** for the animation layer. If that is ever judged too expensive, reverting is contained:
  restore the observer-based `Reveal` (one component, and the `motion` import in `main.jsx`).
- **Boundary:** it is a *landing-page* dependency. The signed-in app animates with CSS keyframes
  (`.rise`, the status pulse, the step shimmer) and keeps no motion imports of its own, so the
  library's blast radius stays the marketing page.

### ADR-28: The critique carries its own corrections

- **Decision:** every critique issue must ship a self-contained `fix` — the replacement
  sentence, "delete this claim", or "state that this is not established". `normalise` marks each
  issue `actionable`, and only actionable issues reach the revisor
  (`critic.actionableIssues`). Fix-less issues are still stored and shown to the reader.
- **Rejected:** giving the revision pass the full page text the critic reads, so it could look
  up the correction itself.
- **Why:** the revisor works from the draft, the gathered findings and the critique — the same
  evidence the writer had, since the writer never received page text either. Shipping whole
  pages into the revision would make it the largest prompt in the pipeline and invite a
  re-research pass inside an edit. The critic is the agent holding the source text, so the
  correction belongs in its output. A fix that says "verify this figure against [4]" is not an
  instruction; it is a finding the revisor can only guess at.
- **Boundary:** the criticism itself is unchanged — `hasMaterialIssues` and the verdict still
  count every issue, because whether a problem exists is independent of whether the critic
  phrased the remedy well.

### ADR-29: The revision is judged on facts, not length

- **Decision:** `writer.revisionRejection` accepts a revision unless it is empty, drops every
  citation, has no `##` headings left, or keeps fewer than half of the draft's figures (when
  the draft had at least five). The reason is recorded in `revisionRejected` and shown to the
  user.
- **Rejected:** `wordCount(candidate) >= 120`, and any other floor on length.
- **Why:** the old test measured that the model produced *something*, not that the result was
  better. It accepted a 130-word stub and rejected a shorter revision that had removed
  unsupported claims — the exact outcome the pass exists to produce, and the reason the length
  ranges were reframed as ceilings ([ADR-25](#adr-25-six-selectable-report-formats)). The four
  new rules each catch a specific way a rewrite goes wrong: degeneration, de-citation,
  fragmenting, and discarding verified content.
- **Cost:** a revision that legitimately deletes most figures would be rejected; the bar is
  lenient (half, and only with five or more present) and the fallback is the draft, which is
  the safe direction.

### ADR-30: A stopped or failed run is still stored

- **Decision:** `runResearch` wraps the pipeline; on any throw it saves what the run reached
  with `status: "stopped"` (the stop switch aborted) or `"failed"`, plus `error`. The record
  carries the plan, sources, steps, phases, usage and whatever draft text was streamed.
- **Rejected:** persisting nothing on failure (the previous behaviour), and persisting the
  partial draft as `status: "complete"`.
- **Why:** a run costs real search and model spend, and a stop or crash used to throw that away
  before the persist phase — the history list and the reopened report were both empty. Saving
  it under an honest status keeps the evidence and the cost visible, and the UI already knows
  how to render a partial report (`stopped` shows a warning that the critique and citation
  audit never ran).
- **Boundary:** nothing is saved when the run never got a plan or a single source — there
  would be nothing to reopen. A revision that was never accepted is not stored over the draft
  (see [ADR-29](#adr-29-the-revision-is-judged-on-facts-not-length)).

### ADR-31: Each format owns its diagram requirement

- **Decision:** the number and type of Mermaid diagrams is stated in the format's own
  structure — one flowchart for the analyst report and the risk assessment, exactly one
  `timeline` diagram for the timeline, and none for the brief, comparison and evidence
  review. `SHARED_RULES` enforces only what the format asks for, and the writer's closing
  user message asks for the report, not for a diagram.
- **Rejected:** the previous arrangement, where `SHARED_RULES` asked for "one or two"
  diagrams and the writer's final instruction demanded "at least one Mermaid diagram" on
  every call.
- **Why:** the two instructions contradicted each other, and the unconditional one won. The
  executive brief is specified as a one-pager with no diagram, yet still received one — the
  writer overriding the structure the critic was auditing against. Writing each requirement
  where the structure is defined leaves one source of truth and lets a format legitimately
  have none.
- **Cost:** six specs to keep honest, and the absence of a line now means "no diagram". No
  code checks that a required diagram exists; a missing one is at best caught by the
  critic's `structure` check.

### ADR-32: Page-derived text is named as untrusted in every prompt that reads it

- **Decision:** the researcher, critic, writer and revisor system prompts all carry the same
  paragraph: source text and the findings extracted from it are untrusted data, instructions
  inside them must not be followed, and they are only to be extracted, cited or audited.
- **Rejected:** putting the warning only in the researcher's prompt, and relying solely on
  output validation to catch a hijacked extraction.
- **Why:** the researcher and critic read page bodies, and the writer and revisor read
  findings that are page text passed through one model — a sentence shaped like an
  instruction survives that hop, so warning only at the first reader protects only the first
  call. Naming it in all four costs one paragraph and removes an asymmetry nothing in the
  design justified.
- **Boundary:** this is a mitigation, not a guarantee, and nothing measures whether it
  reduces injection success. What bounds the damage is structural: the researcher emits a
  bounded finding schema with a citation whitelist, the writer never receives page text, and
  the report renders as safe Markdown ([§17](backend.md#17-security--robustness)).

---
