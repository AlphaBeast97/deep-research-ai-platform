# Deep Research — frontend

React 19 + Vite 8 + Tailwind CSS v4 single-page client for the Deep Research
backend. It starts a run over SSE, streams the agent trace and the report as it
is written, renders Markdown (with [Mermaid](https://mermaid.js.org) diagrams
and clickable citation chips), and manages saved-report history.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

The API base URL comes from `VITE_API_URL` and defaults to
`http://localhost:5000`. Copy `.env.example` to `.env` to point it elsewhere.

## Layout

```
src/
├── App.jsx                 # shell: header, query form, layout, tabs
├── api.js                  # POST-stream SSE parser + REST calls
├── index.css               # Tailwind v4 import, theme tokens, report styles
├── hooks/useResearch.js    # one-run state machine (idle → running → done/error)
├── lib/
│   ├── cn.js               # class-name join helper
│   ├── export.js           # .md download + print-to-PDF
│   └── format.js           # hostOf / timeAgo / slugify / wordCount
└── components/
    ├── ui/                 # Button, Panel, Badge primitives
    ├── QueryForm.jsx       # topic input + examples + stop
    ├── AgentTrace.jsx      # plan checklist and step-by-step agent log
    ├── ReportView.jsx      # streamed report + export toolbar
    ├── SourcesPanel.jsx    # numbered source cards (citation jump targets)
    ├── HistoryPanel.jsx    # saved reports
    ├── Markdown.jsx        # react-markdown + GFM + citation chips
    └── Mermaid.jsx         # lazy Mermaid renderer with error fallback
```

## Styling

Tailwind CSS v4 is wired through `@tailwindcss/vite` — no `tailwind.config.js`
is needed. Design tokens live in `src/index.css`:

- CSS custom properties (`--c-bg`, `--c-accent`, …) define the dark and light
  palettes; the light palette is applied automatically under
  `prefers-color-scheme: light`.
- `@theme inline` maps those variables onto utilities (`bg-surface`, `text-muted`,
  `border-line`, `rounded-panel`, `shadow-panel`, …).
- The rendered report (produced by `react-markdown`, so it can't carry utility
  classes) is styled by the unlayered `.markdown` rules in the same file.

## Mermaid diagrams

`Markdown.jsx` intercepts fenced ` ```mermaid ` blocks and hands them to
`Mermaid.jsx`, which lazily imports the `mermaid` library (so it is code-split
out of the main bundle until a diagram actually appears), renders SVG with
`securityLevel: 'strict'`, and falls back to showing the source if a diagram is
malformed. Diagram syntax is requested from the writer agent — see
`backend/src/agents/prompts.js`.
