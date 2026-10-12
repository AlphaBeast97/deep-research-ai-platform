import { SignInButton, SignUpButton } from '@clerk/react'
import Button from './ui/Button.jsx'
import Mark from './ui/Mark.jsx'

const PIPELINE = [
  { name: 'Plan', tone: 'text-planner', detail: 'Breaks the topic into searchable sub-questions.' },
  { name: 'Research', tone: 'text-researcher', detail: 'Searches, reads whole pages, fills its own gaps.' },
  { name: 'Draft', tone: 'text-writer', detail: 'Streams a cited report as it writes it.' },
  { name: 'Critique', tone: 'text-critic', detail: 'Audits the draft against its own sources.' },
  { name: 'Revise', tone: 'text-writer', detail: 'Applies every critique finding it can.' },
  { name: 'Audit', tone: 'text-ok', detail: 'Checks that each citation resolves.' },
]

const HIGHLIGHTS = [
  {
    title: 'Grounded, cited claims',
    body: 'Every assertion carries a numbered source. Unsupported citations are removed before the report is saved — a broken reference never reaches you.',
  },
  {
    title: 'Private to your account',
    body: 'Reports belong to the account that ran them. Your history is yours alone, and nothing is shared unless you share it yourself.',
  },
  {
    title: 'Exports you can circulate',
    body: 'Send it as Markdown, Word, or PDF. Every format carries its sources, so a reader can always trace a claim back to where it came from.',
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
      <section className="grid items-center gap-10 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div>
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

      {/* ── Highlights ───────────────────────────────────────── */}
      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <div
            key={item.title}
            className="rounded-panel border border-line bg-surface p-5 shadow-panel"
          >
            <h2 className="font-display text-[17px] text-strong">{item.title}</h2>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      {/* ── Pipeline (a real sequence, so it is numbered) ─────── */}
      <section className="mt-16 rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[22px] tracking-tight text-strong">
            Six phases, one question
          </h2>
          <span className="text-[13px] text-muted">
            Watch every step stream in live — nothing happens in a black box.
          </span>
        </div>

        <ol className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((phase, index) => (
            <li key={phase.name} className="rounded-control border border-line-soft bg-inset p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">
                  {index + 1}
                </span>
                <span className={`font-display text-[15px] font-semibold ${phase.tone}`}>
                  {phase.name}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">{phase.detail}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 border-t border-line-soft pt-5 text-[14px] leading-[1.6] text-muted">
          The researcher doesn&apos;t stop at the first page of results. When its own coverage of a
          sub-question is thin, it proposes new searches and goes back — then the critic reads the
          finished draft the way a sceptical editor would, and the writer fixes what it finds.
        </p>
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
