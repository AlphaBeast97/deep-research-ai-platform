# <img src="public/favicon.svg" width="36" alt="" /> MAD Researcher — frontend

React 19 + Vite 8 + Tailwind CSS v4 single-page client for MAD Researcher
backend. It starts a run over SSE, streams the agent trace and the report as it
is written, renders Markdown (with [Mermaid](https://mermaid.js.org) diagrams
and clickable citation chips), and manages saved-report history. The UI is a
warm, editorial theme built entirely from Tailwind tokens — see
[Styling](#styling) and [Animation](#animation) below.

## Run

Requires Node 20.19+ (pinned in `package.json` under `engines`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm test         # node:test — diagram repair (real Mermaid parser), citations, exports
npm run build
```

The API base URL comes from `VITE_API_URL` and defaults to
`http://localhost:5000`. Copy `.env.example` to `.env` to point it elsewhere.

## Layout

```
src/
├── main.jsx                # createRoot + ClerkProvider + LazyMotion
├── App.jsx                 # shell: header, query form, layout, tabs
├── api.js                  # POST-stream SSE parser + REST calls
├── index.css               # Tailwind v4, theme tokens, identity rules, report styles
├── hooks/useResearch.js    # one-run state machine (idle → running → done/error)
├── lib/
│   ├── citations.js        # [n] parsing; exports list cited sources only
│   ├── mermaid.js          # repairs model-written diagrams before Mermaid parses them
│   ├── cn.js               # class-name join helper
│   ├── export.js           # .md download + print-to-PDF (both with a sources appendix)
│   ├── docx.js             # Markdown → .docx
│   ├── motionFeatures.js   # the motion feature set, kept in its own chunk
│   └── format.js           # hostOf / timeAgo / slugify / wordCount
└── components/
    ├── ui/                 # Button · Panel · Badge · Mark · FadeBox · StatusPill · Reveal
    ├── Landing.jsx         # signed-out marketing page
    ├── QueryForm.jsx       # topic input + examples + stop
    ├── AgentTrace.jsx      # collapsible trace: step pill, plan checklist, steps
    ├── ReportView.jsx      # streamed report (faded collapse) + export toolbar
    ├── SourcesPanel.jsx    # numbered source cards (citation jump targets)
    ├── HistoryPanel.jsx    # saved reports
    ├── Markdown.jsx        # react-markdown + GFM + citation chips
    └── Mermaid.jsx         # lazy Mermaid renderer with error fallback
```

## Styling

Tailwind CSS v4 is wired through `@tailwindcss/vite` — no `tailwind.config.js`
is needed. Design tokens live in `src/index.css`:

- CSS custom properties (`--c-bg`, `--c-accent`, …) define the dark and light
  palettes. Dark is the base `:root`; light is `:root[data-theme='light']`, and
  `document.documentElement.dataset.theme` always holds the resolved theme. The
  header switches between light, dark and system; the choice is remembered in
  `localStorage` and applied before first paint, so there is no flash.
- The identity is a warm "reading room": ink on paper, one teal accent, amber for
  annotations, with `Fraunces` (display), `Newsreader` (report prose) and
  `Public Sans` (UI) loaded from Google Fonts in `index.html`.
- `@theme inline` maps those variables onto utilities (`bg-surface`, `text-muted`,
  `border-line`, `rounded-panel`, `shadow-panel`, …). Components only ever name
  tokens, so the palette is changed in one place rather than in each component.
- A handful of unlayered rules carry what utilities cannot: the report's
  `.markdown` typography, the annotation motif (`.marker`, `.sketch-rule`), the
  live indicators (`.step-pill`, `.status-pill`), the `.fade-box` collapse with
  its blur veil, and `.enter` for rows that stream in.

## Animation

Two systems, deliberately split. The app animates with CSS keyframes only —
`.rise` when a report arrives, `.enter` for streamed rows, and the pulse/shimmer
on the live indicators. The signed-out landing is the only place that uses a
library: `motion`, through `m` + `LazyMotion` with the `domAnimation` feature set,
dynamically imported via `lib/motionFeatures.js` so it lands in its own chunk.
`prefers-reduced-motion` turns both off.

## Mermaid diagrams

`Markdown.jsx` intercepts fenced ` ```mermaid ` blocks and hands them to
`Mermaid.jsx`, which lazily imports the `mermaid` library (so it is code-split
out of the main bundle until a diagram actually appears), renders SVG with
`securityLevel: 'strict'`, and falls back to showing the source if a diagram is
malformed. Diagram syntax is requested from the writer agent — see
`backend/src/agents/prompts.js`.

Before parsing, the source goes through `lib/mermaid.js`. Models reliably write
a couple of shapes Mermaid rejects — Unicode or single-dash arrows in edge
position, and parentheses left unquoted inside a label — and the repair turns
them into the ASCII equivalents rather than costing the report its diagram. Only
shapes the parser was measured to reject are touched, and only for the grammar
types that were tested; `test/mermaid.test.js` checks every rule against the real
Mermaid parser, including that diagrams which already parse are untouched.
