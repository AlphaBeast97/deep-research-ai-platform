import { SignInButton, SignUpButton } from '@clerk/react'
import Button from './ui/Button.jsx'
import Mark from './ui/Mark.jsx'

const PIPELINE = [
  {
    name: 'Plan',
    agent: 'Planner',
    tone: 'text-planner',
    node: 'timeline-node--planner',
    detail: 'Breaks the topic into searchable sub-questions.',
  },
  {
    name: 'Research',
    agent: 'Researcher',
    tone: 'text-researcher',
    node: 'timeline-node--researcher',
    detail: 'Searches, reads whole pages rather than snippets, and fills its own gaps.',
  },
  {
    name: 'Draft',
    agent: 'Writer',
    tone: 'text-writer',
    node: 'timeline-node--writer',
    detail: 'Streams a cited report as it writes it.',
  },
  {
    name: 'Critique',
    agent: 'Critic',
    tone: 'text-critic',
    node: 'timeline-node--critic',
    detail: 'Audits the draft against its own sources and names what is wrong.',
  },
  {
    name: 'Revise',
    agent: 'Writer',
    tone: 'text-writer',
    node: 'timeline-node--writer',
    detail: 'Applies every critique finding it can.',
  },
  {
    name: 'Audit',
    agent: 'No model',
    tone: 'text-ok',
    node: 'timeline-node--ok',
    detail: 'Checks that every citation resolves — and drops the ones that do not.',
  },
]

const icon = (paths) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
)

const HIGHLIGHTS = [
  {
    title: 'Grounded, cited claims',
    body: 'Every assertion carries a numbered source. Unsupported citations are removed before the report is saved — a broken reference never reaches you.',
    icon: icon(
      <>
        <path d="M9 4h6l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        <path d="M14 4v5h5" />
        <path d="M8.5 14.5l1.6 1.6L13 12.6" />
      </>,
    ),
  },
  {
    title: 'Private to your account',
    body: 'Reports belong to the account that ran them. Your history is yours alone, and nothing is shared unless you share it yourself.',
    icon: icon(
      <>
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        <path d="M12 14v2.5" />
      </>,
    ),
  },
  {
    title: 'Exports you can circulate',
    body: 'Send it as Markdown, Word, or PDF. Every format carries its sources, so a reader can always trace a claim back to where it came from.',
    icon: icon(
      <>
        <path d="M12 4v11" />
        <path d="M8 11.5 12 15.5l4-4" />
        <path d="M5 19h14" />
      </>,
    ),
  },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Mark className="h-9 w-9" />
      <span className="font-display text-[17px] font-semibold tracking-tight whitespace-nowrap text-strong sm:text-[19px]">
        MAD Researcher
      </span>
    </div>
  )
}

/** A citation marker, matching the report's chips. Illustration only. */
function Chip({ children }) {
  return (
    <span className="ml-0.5 inline-grid h-[15px] min-w-[15px] translate-y-[3px] place-items-center rounded-[4px] border border-accent/35 bg-accent/12 px-1 text-[10px] font-bold text-accent">
      {children}
    </span>
  )
}

/** A dot on the timeline spine, masking the dashes around itself. */
function Marker({ className = '' }) {
  return (
    <span className="relative z-[1] grid h-[31px] w-[31px] flex-none place-items-center">
      <span
        className={`h-[11px] w-[11px] rounded-full shadow-[0_0_0_6px_var(--c-surface)] ${className}`}
      />
    </span>
  )
}

export default function Landing() {
  return (
    <div className="mx-auto max-w-[1120px] px-6 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <Brand />
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button variant="ghost" size="md">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="primary" size="md">
              Create account
            </Button>
          </SignUpButton>
        </div>
      </header>

      {/* ── Hero: left-hand pitch, right-hand example note ─────── */}
      <section className="relative grid items-center gap-10 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-[26%] h-72 w-72 -translate-x-1/2 rounded-full bg-accent/12 blur-3xl"
        />
        <div className="relative">
          <h1 className="font-display text-[40px] leading-[1.04] tracking-tight text-strong sm:text-[56px]">
            Research that shows its work.
          </h1>
          <p className="mt-5 max-w-[560px] text-[16px] leading-[1.6] text-muted sm:text-[17px]">
            Ask a question. A team of agents plans the investigation, searches the web, reads whole
            pages rather than snippets, writes a cited report, then attacks its own draft before you
            ever see it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <SignUpButton mode="modal">
              <Button variant="primary" size="lg">
                Start researching free
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button variant="ghost" size="lg">
                I already have an account
              </Button>
            </SignInButton>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            Bring your own model and search keys — OpenAI is not required.
          </p>
        </div>

        {/* The product, in one note: a question and its cited answer. */}
        <figure className="relative">
          <div className="rounded-panel border border-line bg-surface p-5 shadow-panel">
            <p className="text-[12px] font-semibold text-muted">A question</p>
            <p className="mt-1.5 font-display text-[19px] leading-snug tracking-tight text-strong">
              How do solid-state batteries compare to lithium-ion in 2026?
            </p>

            <div className="mt-4 space-y-2.5 border-t border-line-soft pt-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ok">
                <span className="h-[6px] w-[6px] rounded-full bg-ok" />
                Report ready
              </span>
              <p className="text-[14px] leading-[1.55] text-fg">
                All-solid-state cells remain in pilot testing, carrying a 3–5× production-cost
                premium over lithium-ion<Chip>9</Chip>.
              </p>
              <p className="text-[14px] leading-[1.55] text-fg">
                Semi-solid hybrids are the only design shipping in vehicles today<Chip>3</Chip>
                <Chip>16</Chip>.
              </p>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-[12px] text-muted">
            <span className="sketch-rule">Example output</span>
          </figcaption>
        </figure>
      </section>

      {/* ── What you get: one band, hairline-divided (not three boxes) ── */}
      <section className="mt-16 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title} className="bg-surface p-6">
            <span className="inline-grid h-10 w-10 place-items-center rounded-control border border-line bg-surface-2 text-accent">
              {item.icon}
            </span>
            <h2 className="mt-3.5 font-display text-[17px] text-strong">{item.title}</h2>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      {/* ── The pipeline as a journey, not a grid of boxes ────── */}
      <section className="mt-16 rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-10">
        <div className="mx-auto max-w-[640px]">
          <h2 className="font-display text-[24px] tracking-tight text-strong sm:text-[26px]">
            One question in. A cited report out.
          </h2>
          <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">
            Six phases, streamed live — nothing happens in a black box. It reads a page before it
            trusts it, and goes back for more when it is not sure.
          </p>

          <div className="relative mt-10">
            <span className="timeline-spine" aria-hidden="true" />
            <ol className="list-none p-0">
              <li className="relative flex gap-5 pb-7">
                <Marker className="bg-muted" />
                <p className="pt-1.5 text-[14.5px] font-semibold text-strong">Your question</p>
              </li>

              {PIPELINE.map((phase, index) => (
                <li key={phase.name} className="relative flex gap-5 pb-7">
                  <span className={`timeline-node ${phase.node}`}>{index + 1}</span>
                  <div className="pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="font-display text-[17px] text-strong">{phase.name}</h3>
                      <span className={`text-[11.5px] font-semibold ${phase.tone}`}>
                        {phase.agent}
                      </span>
                    </div>
                    <p className="mt-1 text-[14px] leading-[1.6] text-muted">{phase.detail}</p>
                  </div>
                </li>
              ))}

              <li className="relative flex gap-5">
                <Marker className="h-[13px] w-[13px] bg-accent" />
                <p className="pt-1.5 text-[14.5px] font-semibold text-accent">A cited report</p>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="mt-16 text-center">
        <h2 className="font-display text-[26px] tracking-tight text-strong">Ready when you are.</h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[14px] leading-[1.6] text-muted">
          Sign in and run your first question. Reports are saved to your account, so you can come
          back to them and export any of them at any time.
        </p>
        <div className="mt-6 flex justify-center">
          <SignUpButton mode="modal">
            <Button variant="primary" size="lg">
              Create your account
            </Button>
          </SignUpButton>
        </div>
      </section>

      <footer className="mt-16 border-t border-line-soft pt-6 text-center text-[13px] text-muted">
        MAD Researcher — Multi-Agent Researcher
      </footer>
    </div>
  )
}
