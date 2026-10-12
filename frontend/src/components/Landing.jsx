import { SignInButton, SignUpButton } from '@clerk/react'
import Button from './ui/Button.jsx'
import Mark from './ui/Mark.jsx'
import Reveal from './ui/Reveal.jsx'

const PIPELINE = [
  {
    name: 'Plan',
    agent: 'Planner',
    tone: 'text-planner',
    dot: 'bg-planner',
    detail: 'Breaks the topic into searchable, independent sub-questions.',
    output: 'searchable sub-questions',
  },
  {
    name: 'Research',
    agent: 'Researcher',
    tone: 'text-researcher',
    dot: 'bg-researcher',
    detail: 'Searches, then reads whole pages rather than snippets — and goes back when coverage is thin.',
    output: 'cited findings and gaps',
  },
  {
    name: 'Draft',
    agent: 'Writer',
    tone: 'text-writer',
    dot: 'bg-writer',
    detail: 'Synthesises every finding into one report, with a numbered source on each claim.',
    output: 'a streamed draft',
  },
  {
    name: 'Critique',
    agent: 'Critic',
    tone: 'text-critic',
    dot: 'bg-critic',
    detail: 'Audits the draft against its own sources and names what is unsupported, wrong or missing.',
    output: 'issues and a verdict',
  },
  {
    name: 'Revise',
    agent: 'Writer',
    tone: 'text-writer',
    dot: 'bg-writer',
    detail: 'Rewrites the report with the critique applied, keeping what was already correct.',
    output: 'the corrected report',
  },
  {
    name: 'Audit',
    agent: 'No model',
    tone: 'text-ok',
    dot: 'bg-ok',
    detail: 'Checks every citation resolves — and removes the ones that do not.',
    output: 'verified citations',
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
          <Reveal
            as="h1"
            className="font-display text-[40px] leading-[1.04] tracking-tight text-strong sm:text-[56px]"
          >
            Research that shows its work.
          </Reveal>
          <Reveal
            as="p"
            delay={90}
            className="mt-5 max-w-[560px] text-[16px] leading-[1.6] text-muted sm:text-[17px]"
          >
            Ask a question. A team of agents plans the investigation, searches the web, reads whole
            pages rather than snippets, writes a cited report, then attacks its own draft before you
            ever see it.
          </Reveal>
          <Reveal delay={180} className="mt-8 flex flex-wrap items-center gap-2.5">
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
          </Reveal>
          <Reveal as="p" delay={260} className="mt-4 text-[13px] text-muted">
            Bring your own model and search keys — OpenAI is not required.
          </Reveal>
        </div>

        {/* The product, in one note: a question and its cited answer. */}
        <Reveal as="figure" delay={140} className="relative">
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
        </Reveal>
      </section>

      {/* ── What you get: one band, hairline-divided (not three boxes) ── */}
      <section className="mt-16 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
        {HIGHLIGHTS.map((item, index) => (
          <Reveal key={item.title} delay={index * 90} className="bg-surface">
            <div className="group h-full p-6 transition-colors hover:bg-surface-2">
              <span className="inline-grid h-10 w-10 place-items-center rounded-control border border-line bg-surface-2 text-accent transition-colors group-hover:border-accent/40">
                {item.icon}
              </span>
              <h2 className="mt-3.5 font-display text-[17px] text-strong">{item.title}</h2>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ── The six phases, as chapters ─────────────────────── */}
      <section className="mt-16 rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-10">
        <Reveal
          as="h2"
          className="font-display text-[24px] tracking-tight text-strong sm:text-[28px]"
        >
          One question in. A cited report out.
        </Reveal>
        <Reveal as="p" delay={80} className="mt-2 max-w-[620px] text-[14.5px] leading-[1.6] text-muted">
          Six phases, streamed live — nothing happens in a black box. It reads a page before it
          trusts it, and goes back for more when it is not sure.
        </Reveal>

        <ol className="mt-10 list-none p-0">
          {PIPELINE.map((phase, index) => (
            <Reveal
              as="li"
              key={phase.name}
              delay={index * 60}
              className="group grid gap-x-10 gap-y-3 border-t border-line-soft py-7 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]"
            >
              <div>
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-display text-[30px] leading-none transition-transform duration-300 group-hover:scale-110 ${phase.tone}`}
                  >
                    {index + 1}
                  </span>
                  <h3 className="font-display text-[19px] tracking-tight text-strong">
                    {phase.name}
                  </h3>
                </div>
                <span className={`mt-2 block text-[11.5px] font-semibold ${phase.tone}`}>
                  {phase.agent}
                </span>
              </div>

              <div>
                <p className="max-w-[560px] text-[14.5px] leading-[1.65] text-muted">
                  {phase.detail}
                </p>
                <span className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-muted">
                  <span className={`h-[6px] w-[6px] flex-none rounded-full ${phase.dot}`} />
                  {phase.output}
                </span>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="mt-16 text-center">
        <Reveal as="h2" className="font-display text-[26px] tracking-tight text-strong">
          Ready when you are.
        </Reveal>
        <Reveal
          as="p"
          delay={80}
          className="mx-auto mt-2 max-w-[520px] text-[14px] leading-[1.6] text-muted"
        >
          Sign in and run your first question. Reports are saved to your account, so you can come
          back to them and export any of them at any time.
        </Reveal>
        <Reveal delay={150} className="mt-6 flex justify-center">
          <SignUpButton mode="modal">
            <Button variant="primary" size="lg">
              Create your account
            </Button>
          </SignUpButton>
        </Reveal>
      </section>

      <footer className="mt-16 border-t border-line-soft pt-6 text-center text-[13px] text-muted">
        MAD Researcher — Multi-Agent Researcher
      </footer>
    </div>
  )
}
