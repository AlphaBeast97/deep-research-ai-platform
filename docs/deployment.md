# MAD Researcher — Deployment proposal

> Part of the [architecture record](ARCHITECTURE.md). §22 is the only section here that
> did not exist in the single-file original; §1–§21 keep their numbering in the other files.

---

## 22. Deployment proposal

Where should this run in production? The answer is forced almost entirely by four
properties of the code, so those come first. A platform that fails any of them fails *in the
middle of a research run*, which is the worst possible moment to find out.

### 22.1 What the workload actually demands

Nothing here is a preference; each row is a constraint the code already imposes.

| # | Requirement | Where it comes from |
|---|---|---|
| **R1** | One HTTP response that stays open for **up to 15 minutes** | A run *is* a single `POST /api/research/stream` response held open across the whole pipeline — measured at **133 s** ([§15.1](verification.md#151-end-to-end-live-run)), with a hard ceiling of `RUN_TIMEOUT_MS` = 900 s ([§14](backend.md#14-configuration-and-api-reference)) |
| **R2** | Long **idle** gaps must not drop the socket | `: ping` heartbeat every 15 s, precisely because multi-second silences are normal ([ADR-17](decisions.md#adr-17-heartbeat--closed-flag)) — this covers the common 60 s proxy idle timeout |
| **R3** | The response must not be **buffered or transformed** in transit | `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, `flushHeaders()` in the stream handler ([§9](backend.md#9-the-streaming-protocol-sse)). A proxy that buffers makes the product's entire differentiator — watching the agents work — disappear |
| **R4** | **Exactly one instance**, never a replica pool | Run state lives in the process: the page-text `Map`, the citation `SourceIndex`, the `AbortController`, the `closed` flag. A replica that does not hold the connection cannot continue the run, so horizontal scaling is a no-op *at best* |
| **R5** | Two deployables from one repository | A Node 20.19+ Express API and a Vite SPA whose API URL and Clerk key are baked in at **build time** (`frontend/src/api.js`, `frontend/.env.example`) |
| **R6** | A public health-check path | `GET /api/health` — the only route without a session ([§14](backend.md#14-configuration-and-api-reference)) |
| **R7** | **Outbound access to MongoDB Atlas** | Atlas rejects connections from unlisted addresses, so a platform with dynamic egress needs either a world-open allow-list entry or static egress IPs ([§12](backend.md#12-storage-the-mongodb-facade)) |
| **R8** | **A domain you control** | Clerk's *production* instance issues DNS records for its `clerk`, `accounts` and `clkmail` subdomains, so a `*.onrender.com` / `*.up.railway.app` address cannot be the production origin for auth ([ADR-23](decisions.md#adr-23-clerk-auth-with-owner-scoped-reports)) |
| **R9** | Five server secrets and an exact CORS origin | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `MONGODB_URI`, `TAVILY_API_KEY`, `LLM_API_KEY`; `CLIENT_ORIGIN` is a single exact string, not a pattern (`app.js`) |

**R1 and R8 are the two filters that eliminate most of the market.** R8 rules out
"netlify-drop-an-SPA" as a complete answer; R1 rules out every platform whose request
ceiling is a few minutes.

Two more facts make the deployment small: the server already reads `PORT` and `app.listen`
already binds every interface, so any platform that injects `PORT` works without a code
change; and there is no filesystem state, so no volumes or persistent disks are needed.

### 22.2 The candidates

#### Render — recommended

| Fact | Source |
|---|---|
| Web services accept HTTP responses **up to 100 minutes** | Render, *Render vs Railway* (first-party) |
| Web services must bind `0.0.0.0`; expected port defaults to 10000 and comes from `PORT` | Render, *Web Services* docs |
| Free instance: 0.1 CPU / 512 MB, 750 instance-hours per workspace per month, **spins down after 15 minutes** without inbound traffic, ~1 minute to wake | Render, *Deploy for Free* |
| Compute from **$7/month** (0.5 CPU / 512 MB, the `0.5c-512mb` plan); static sites free with a global CDN | Render, *Pricing* and *Blueprint YAML Reference* |
| Blueprint (`render.yaml`) declares web services and static sites as infrastructure-as-code; `type: web` + `runtime: static` for a static site | Render, *Blueprint YAML Reference* |

**Verdict: passes R1–R9.** The 100-minute ceiling is 6.6× the run's own 15-minute backstop,
the static site is a first-class service type in the same blueprint, and the free tier is
enough to demo the product. **Confidence: high** — the timeout, port, spin-down and pricing
facts are all first-party documentation.

#### Google Cloud Run — the best $0 option

| Fact | Source |
|---|---|
| Request timeout defaults to **300 s**, configurable **up to 3600 s** | Google Cloud, *Configure request timeout for services* |
| HTTP server streaming (which is what SSE is) has been supported since 2020 | Google Cloud blog, *Cloud Run now supports HTTP/gRPC server streaming* |
| Free tier: 2M requests, **240,000 vCPU-seconds** and 450,000 GiB-seconds per month | Google Cloud, *Cloud Run pricing* |

Concretely, the free tier is worth roughly **1,800 deep runs per month** (240,000 vCPU-s ÷
133 s ≈ 1,804), which is more than any hobby deployment will use.

**Verdict: passes R1–R9**, but it costs an hour of setup rather than ten minutes: a
Dockerfile, an Artifact Registry push, IAM, a service with max instances pinned to 1 (R4),
and a second static-hosting path for the SPA — `app.js` serves only `/api`, so serving the
frontend from the same container would mean adding `express.static`, a code change this
proposal deliberately avoids.

**Confidence: high** on the timeout and streaming support; **medium** on the free-tier
figures, which are published per billing mode (request-based billing historically quoted
180,000 vCPU-seconds).

#### Railway — works, but only exactly

| Fact | Source |
|---|---|
| HTTP requests run "**up to 15 minutes** if data keeps transferring (for example, keep-alive heartbeats)", otherwise closed after 5 minutes of silence; the proxy keep-alive timeout is 60 s | Railway, *Public networking — Specs and limits* |
| Hobby plan: $5/month including $5 of usage | Railway, *Pricing* |

**Verdict: R2–R9 pass; R1 passes only exactly.** 15 minutes is the *same* number as
`RUN_TIMEOUT_MS`, so a run that reaches its own ceiling is killed by the platform edge
instead of being reported by our own timeout — the user gets a dropped connection with no
explanation. Usable, but only with `RUN_TIMEOUT_MS` lowered to ~660,000 ms. Railway's
heartbeat tolerance is also satisfied by our existing 15 s ping.

**Confidence: high** on the limits (first-party docs); the reliability and CDN claims made in
competitors' comparison pages are ignored here.

#### Fly.io — capable, more operations

There is no documented request timeout, and the proxy closes *idle* connections after about
60 seconds, a timer that data flowing through resets — the 15 s heartbeat covers it. You own
a Dockerfile, machines, releases and scaling, and there is no free static-site tier to pair
with the API. **Verdict: passes, third choice. Confidence: medium** — the idle-timeout
behaviour is documented by community threads and independent write-ups, not found in
first-party docs during this evaluation.

#### Vercel — right for the SPA, wrong for this API

| Fact | Source |
|---|---|
| Hobby: maximum duration **300 s**, default *and* maximum. Pro: 300 s default, configurable to **800 s** | Vercel, *Configuring maximum duration* and *Hobby plan* |
| Durations above 800 s (up to 30 minutes) exist only as an **Extended max duration beta** for Pro/Enterprise, configured **per function** | Vercel, *Configuring maximum duration* |
| HTTP/2 connections get PING frames while idle; **HTTP/1.1 connections may still be closed**, so Vercel recommends streaming heartbeats | Vercel, same page |

**Verdict: fails R1 as configured.** 800 s (Pro, paid) is below the run's 900 s ceiling, and a
Hobby project cannot honour even the tail of a deep run. The SPA would be at home there;
splitting vendors to host one half of a two-service app buys nothing. **Confidence: high** —
first-party docs.

#### DigitalOcean App Platform — unverified

Could not be evaluated: the App Platform limits page timed out twice during this assessment
and no first-party statement of the HTTP request ceiling was found. Community threads show
timeouts being raised at the application level, which does not answer the question. Treated
as **unverified rather than rejected** — worth a look if one of the others is unavailable.

Other serverless-first platforms (Lambda behind API Gateway, Azure Functions, Cloudflare
Workers) were not pursued: they inherit the same class of hard response ceiling as Vercel and
the same per-invocation model, so R4 gets harder rather than easier.

### 22.3 At a glance

| Platform | Longest response | Cost at hobby scale | Static SPA included | Setup | Verdict |
|---|---|---|---|---|---|
| **Render** | **100 min** | **$7/mo** (free tier spins down) | Yes — free static site + CDN | ~10 min, one YAML | **Recommended** |
| Google Cloud Run | 60 min | ~$0 inside the free tier | No — second service or code change | ~1 h | Runner-up |
| Railway | 15 min | $5/mo | No | ~10 min | Tight fit (see R1) |
| Fly.io | none documented | metered | No | ~1 h | Capable, more ops |
| Vercel | 300 s / 800 s | $0 / $20+ | Yes (its strength) | ~10 min | Fails R1 |
| DigitalOcean | unverified | — | Yes | — | Unverified |

### 22.4 The recommendation

**Deploy on Render: the API as a web service and the SPA as a static site, both declared in
one `render.yaml` at the repository root.**

The reasoning, in the order the constraints matter:

1. **R1 with margin, not luck.** 100 minutes of permitted response time against a configured
   ceiling of 15, so the run's own timeout is the only timer that can end a run — the
   operator's logs say *why* it ended.
2. **R4 is the platform's normal case.** This app must run as a single instance holding
   per-run memory; Render's model is one instance per service, and scaling is opt-in. No
   workaround, no advisory lock, no "please keep replicas at 1" note for the next person.
3. **The SPA is not a second product to operate.** A static site in the same blueprint is
   free, has a CDN, and keeps `CLIENT_ORIGIN` a single string that matches exactly the
   frontend's origin.
4. **No code changes.** `PORT` is already read, `app.listen` already binds every interface,
   the SSE headers already defeat proxy buffering, and `GET /api/health` is already a health
   check path.
5. **Predictable money.** One flat instance price, no per-request billing, and a free tier
   that is enough to hand someone a demo URL — with the honest caveat that a free service
   sleeps after 15 idle minutes and takes about a minute to wake.

**If $0 matters more than setup time, use Cloud Run** with the same two-service shape (API
container + the SPA as a static bucket or a tiny second service). The request timeout must be
raised from its 300 s default to at least 60 minutes, and max instances pinned to 1.

### 22.5 The blueprint

`render.yaml` is **committed at the repository root**, and it is the source of truth for the
deploy — create the Blueprint from the Render dashboard and Render reads it directly. Four
decisions in that file are worth reading it for:

- **`plan: free` is explicit.** An omitted plan defaults to `0.5c-512mb`, the paid tier, so the $0
  path has to say so. Static sites have no plan and never sleep.
- **`CLIENT_ORIGIN` is derived, not typed.** R9 wants an exact origin, which is the value most
  likely to be wrong by a character. It is a `fromService` reference to the static site's own
  `RENDER_EXTERNAL_URL`, so renaming a service cannot silently break CORS. `VITE_API_URL` is
  hardcoded instead, because it is baked in at build time and a reference that resolved empty
  would build an SPA with no API URL at all.
- **The secrets are `sync: false`** — Render prompts for them on the first sync, so nothing
  sensitive is stored in the repository.
- **The behaviour knobs are pinned to the values this project actually runs with.** Every one has
  a default in `config.js`, but a deploy that quietly ran `RESEARCH_CONCURRENCY=3` while
  development ran 6 would be a different product. `PORT` and `CLIENT_ORIGIN` are the two the file
  deliberately does not pin: Render injects the port, and the origin is derived.

Both `package.json` files pin Node (`>=20.19.0 <25`) — the floor Vite 8 imposes — so a future
change to Render's default runtime cannot break the static build.

Validate the file before syncing it: Render serves the Blueprint spec from SchemaStore.org for IDE
validation and provides CLI and API validation endpoints. The shape is first-party documented; the
exact field spellings are worth one CLI validation pass.

### 22.6 Setup, in the order that avoids rework

1. **Buy a domain first** *(the paid path — the $0 variant at the end of this section skips
   it)*. Nothing else can be finished without it: Clerk's production instance needs it (R8), and
   every URL below depends on the final origin.
2. **Clerk → create the production instance** and add the DNS records it issues. Then collect
   the production publishable and secret keys.
3. **MongoDB Atlas → cluster + database user.** Under Network Access, either add a world-open
   entry (`0.0.0.0/0`) with a database user scoped to this one database, or use static egress
   IPs if your Render plan provides them. Copy the connection string into `MONGODB_URI`.
4. **Point the API at the SPA's origin.** `CLIENT_ORIGIN` must be the scheme, host and port
   the browser uses, character for character — a trailing slash or a `www.` that the SPA does
   not use is a CORS failure on every request.
5. **Sync the blueprint**, filling the prompted secrets. Confirm the boot banner reports
   `storage mongo (…)`, `llm <your endpoint>` and `auth Clerk`, then check the health payload
   at `https://<api-host>/api/health`: `missingKeys` must be empty.
6. **Verify with the cheap run before the expensive one.** Set `RESEARCH_MAX_ROUNDS=0` and
   `DEEP_FETCH=false`, run one query end to end, then set them back. `npm test` on the server
   proves the pure logic; only a live run proves the platform's proxy does not buffer the
   stream, and one short run finds that out for a fraction of the tokens.
7. **Watch the first deep run's tail.** From the browser's network tab, confirm the SSE
   response stays open past 60 s (proves R2/R3 through the real proxy) and that events keep
   arriving during the research phase's silent stretches.

**Two operational hazards worth knowing before you hit them:**

- **A deploy during a run ends that run.** There is no resume: a dropped connection is a lost
  run ([§20](verification.md#20-known-limitations-and-honest-gaps), limitation 8). Deploy
  between runs, and treat a mid-run deploy as user-visible damage.
- **The free instance sleeps.** Fifteen idle minutes and the next request pays a ~1 minute
  cold start *before* the research even begins — a demo URL that looks broken. Use the $7/mo
  tier for anything shared with people who did not build it.

**The $0 variant.** Everything above assumes a paid Render instance and a Clerk *production*
instance — and production is what forces a domain (R8). To stand the same two services up for
nothing: keep `plan: free` on the API (an omitted plan defaults to the paid `0.5c-512mb`), and use
the Clerk **development** instance the app already runs against locally (`pk_test_` / `sk_test_`),
which does not require DNS records. The rest of the stack is free at this size — Atlas M0, Tavily's
free credits, and an LLM free tier. What that trades away is real: Clerk's development limits, a
cold start on the first request after the API sleeps, and an LLM tier that rate-limits (the
provider's `429`, surfaced verbatim by the app) well before it runs out of quota. Treat it as a
demo configuration. It is the configuration `render.yaml` at the repo root is written for.

### 22.7 What it costs

| Setup | Monthly | Notes |
|---|---|---|
| Render, free tier | **$0** | API sleeps after 15 idle minutes (~1 min wake); 750 instance-hours/month; static site free |
| Render, Starter | **~$7** | Always on, 0.5 CPU / 512 MB, zero-downtime deploys; the recommendation |
| Cloud Run | **~$0** | Inside the free tier for ~1,800 deep runs/month; scale-to-zero adds a cold start |
| Railway | **~$5** | Hobby includes $5 of usage |
| Plus, either way | variable | Atlas free tier (M0) is enough at this data shape; a domain (~$10–15/year); LLM and Tavily usage are billed by those providers, not the host |

The compute line is the smallest part of the bill. **A deep run costs more in tokens than in
hosting** — 105,937 tokens in the measured run ([§15.1](verification.md#151-end-to-end-live-run)),
against ~$0.23/day of hosting on Render Starter. Anyone optimising this system's cost should
start at `LLM_MODEL` and `RESEARCH_CONCURRENCY`, not at the host.

### 22.8 Confidence

| Claim | Confidence | Basis |
|---|---|---|
| Render: 100-minute responses, `PORT`/`0.0.0.0`, free spin-down, $7 Starter, static sites in a blueprint | **High** | First-party Render docs and pricing pages |
| Cloud Run: 300 s default → 3600 s max, HTTP streaming supported | **High** | First-party Google Cloud docs |
| Cloud Run free-tier allowances | **Medium** | First-party pricing page, but the figures depend on billing mode |
| Railway: 15-minute request ceiling, 60 s keep-alive | **High** | First-party Railway docs |
| Vercel: 300 s Hobby / 800 s Pro / 1800 s beta, HTTP/1.1 idle caveat | **High** | First-party Vercel docs |
| Fly.io: ~60 s idle timeout, no request ceiling | **Medium** | Community threads and write-ups; no first-party doc found |
| Clerk production requires your own domain and its DNS records | **High** | First-party Clerk deployment docs |
| `render.yaml` is a valid Blueprint | **Medium** | Its shape is first-party documented and it parses as YAML; the field spellings still deserve one CLI validation pass |
| DigitalOcean App Platform's request ceiling | **Unknown** | Docs page unreachable during this evaluation |

All sources were read on **2026-10-11**: `render.com/docs/free`, `render.com/docs/web-services`,
`render.com/docs/blueprint-spec`, `render.com/pricing`, `render.com/articles/render-vs-railway`,
`docs.cloud.google.com/run/docs/configuring/request-timeout`, `cloud.google.com/run/pricing`,
`docs.railway.com/networking/public-networking/specs-and-limits`, `railway.com/pricing`,
`vercel.com/docs/functions/configuring-functions/duration`, `vercel.com/docs/plans/hobby`,
`clerk.com/docs/guides/development/deployment/production`.

### 22.9 What would change this answer

- **Resumable runs.** If a run's progress were persisted and could be resumed by id
  ([§20](verification.md#20-known-limitations-and-honest-gaps), limitation 8), the hard
  requirement on one long response disappears — and serverless platforms with 5-minute
  ceilings become viable again. That is a code change, not a hosting change, and it is the
  single highest-leverage one for deployment flexibility.
- **Multiple instances.** Adding a durable run store (progress in Mongo, a worker per run)
  would relax R4 and allow horizontal scaling — but it converts a web request into a job, so
  the streaming protocol ([§9](backend.md#9-the-streaming-protocol-sse)) would change too.
- **Cheaper compute than Cloud Run's free tier** is not a real goal; the token bill dominates
  by an order of magnitude.

---

*Deployment status: the blueprint is committed (`render.yaml`) and the app is deployment-ready,
but no services have been created — that needs the operator's own Render, Clerk and Atlas
accounts. Nothing else in the repository is provider-specific, and the app runs identically on any
host that satisfies R1–R9.*
