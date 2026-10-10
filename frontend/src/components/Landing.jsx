import { SignInButton, SignUpButton } from '@clerk/react'
import Badge from './ui/Badge.jsx'
import Button from './ui/Button.jsx'

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
    body: 'Reports are owned by the account that ran them. Your history is yours alone, and nothing is shared unless you share it yourself.',
  },
  {
    title: 'Exports you can circulate',
    body: 'Send it as Markdown, Word, or PDF. Every format carries its sources, so a reader can always trace a claim back to where it came from.',
  },
]

function Brand({ size = 'md' }) {
  const mark = size === 'lg' ? 'h-14 w-14 text-[28px]' : 'h-11 w-11 text-[21px]'
  const title = size === 'lg' ? 'text-[30px]' : 'text-[19px]'
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid ${mark} place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/40`}
      >
        ✦
      </span>
      <span className={`font-semibold tracking-tight text-strong ${title}`}>MAD Researcher</span>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <header className="flex items-center justify-between gap-4 py-6">
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

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-10 pb-4 text-center sm:pt-16">
        <Badge tone="accent" className="mb-5">
          Multi-Agent Researcher
        </Badge>
        <h1 className="mx-auto max-w-[860px] text-[38px] leading-[1.08] font-semibold tracking-tight text-strong sm:text-[52px]">
          Research that shows its work.
        </h1>
        <p className="mx-auto mt-5 max-w-[660px] text-[15.5px] text-muted sm:text-[17px]">
          Ask a question. A team of agents plans the investigation, searches the web, reads whole
          pages rather than snippets, writes a cited report, then attacks its own draft before you
          ever see it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
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
        <p className="mt-4 text-xs text-muted">
          Bring your own model and search keys — OpenAI is not required.
        </p>
      </section>

      {/* ── Highlights ───────────────────────────────────────── */}
      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <div
            key={item.title}
            className="rounded-panel border border-line bg-surface p-[18px] shadow-panel"
          >
            <h2 className="text-[14.5px] text-strong">{item.title}</h2>
            <p className="mt-2 text-[13.5px] text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      {/* ── Pipeline ─────────────────────────────────────────── */}
      <section className="mt-14 rounded-panel border border-line bg-surface p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg text-strong">Six phases, one question</h2>
          <span className="text-[13px] text-muted">
            Watch every step stream in live — nothing happens in a black box.
          </span>
        </div>

        <ol className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((phase, index) => (
            <li
              key={phase.name}
              className="rounded-control border border-line-soft bg-inset px-3.5 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-[20px] w-[20px] flex-none place-items-center rounded-md bg-surface-2 text-[11px] font-bold text-muted">
                  {index + 1}
                </span>
                <span className={`text-[13.5px] font-semibold ${phase.tone}`}>{phase.name}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">{phase.detail}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 border-t border-line-soft pt-5 text-[13.5px] text-muted">
          The researcher doesn&apos;t stop at the first page of results. When its own coverage of a
          sub-question is thin, it proposes new searches and goes back — then the critic reads the
          finished draft the way a sceptical editor would, and the writer fixes what it finds.
        </p>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="mt-14 text-center">
        <h2 className="text-[22px] tracking-tight text-strong">Ready when you are.</h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[14px] text-muted">
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

      <footer className="mt-16 border-t border-line-soft pt-6 text-center text-xs text-muted">
        MAD Researcher — Multi-Agent Researcher
      </footer>
    </div>
  )
}
