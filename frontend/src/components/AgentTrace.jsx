import { useState } from 'react'
import Panel from './ui/Panel.jsx'
import FadeBox from './ui/FadeBox.jsx'
import { cn } from '../lib/cn.js'

const AGENT_META = {
  planner: { label: 'Planner', text: 'text-planner', dot: 'bg-planner' },
  researcher: { label: 'Researcher', text: 'text-researcher', dot: 'bg-researcher' },
  writer: { label: 'Writer', text: 'text-writer', dot: 'bg-writer' },
  critic: { label: 'Critic', text: 'text-critic', dot: 'bg-critic' },
}

const FALLBACK = { label: 'Agent', text: 'text-muted', dot: 'bg-muted' }

// Which agent is working, so the step pill can take that agent's colour.
const PHASE_META = {
  plan: { label: 'Planning', pill: 'step-pill--planner' },
  research: { label: 'Researching', pill: 'step-pill--researcher' },
  draft: { label: 'Drafting', pill: 'step-pill--writer' },
  critique: { label: 'Auditing', pill: 'step-pill--critic' },
  revision: { label: 'Revising', pill: 'step-pill--writer' },
  audit: { label: 'Verifying citations', pill: 'step-pill--ok' },
}

function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function StepRow({ step, isLast, running }) {
  const meta = AGENT_META[step.agent] ?? { ...FALLBACK, label: step.agent }
  const pending = step.status === 'start' && isLast && running

  return (
    <li
      className={cn(
        'enter relative flex gap-3 pb-4 last:pb-0',
        !isLast &&
          "before:absolute before:top-4 before:bottom-0 before:left-[4px] before:w-px before:bg-line before:content-['']",
      )}
    >
      <span
        className={cn(
          'mt-[5px] h-[9px] w-[9px] flex-none rounded-full',
          meta.dot,
          pending && 'animate-[pulse_1.3s_ease-in-out_infinite]',
        )}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn('text-[11.5px] font-semibold', meta.text)}>{meta.label}</span>
          <span className="text-[13.5px] text-strong">{step.label}</span>
        </div>
        {step.detail && (
          <p className="mt-0.5 text-[12.5px] break-words text-muted">{step.detail}</p>
        )}
      </div>
    </li>
  )
}

/**
 * The live agent trace. It expands while a run is in flight — so the work is
 * watchable — and folds itself away once the run settles, so the finished
 * report is not buried under a long log. The header is a button, so the reader
 * can override either way.
 */
export default function AgentTrace({ steps, plan, statusMessage, phase, running }) {
  // null = follow the run: expanded while it is in flight, a short faded
  // preview once it settles. A click pins it either way, so the reader can
  // collapse the trace even while agents are still working.
  const [override, setOverride] = useState(null)
  const open = override ?? running
  const toggle = () => setOverride(!open)

  return (
    <Panel>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
      >
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="font-display text-[15px] font-semibold tracking-tight text-strong">
            Agent activity
          </span>
          {running && phase && (
            <span className={cn('step-pill', PHASE_META[phase]?.pill)}>
              <span className="step-pill__dot" aria-hidden="true" />
              {PHASE_META[phase]?.label ?? phase}
            </span>
          )}
        </span>
        <span className="flex flex-none items-center gap-2 text-[12.5px] text-muted">
          {steps.length > 0 && (
            <span>
              {steps.length} step{steps.length === 1 ? '' : 's'}
            </span>
          )}
          <Chevron open={open} />
        </span>
      </button>

      <FadeBox
        className="mt-4"
        collapsedHeight={168}
        expanded={open}
        onToggle={toggle}
        label="Show all activity"
      >
        <div className="rise">
          {statusMessage && <p className="mb-3.5 text-[13px] text-fg">{statusMessage}</p>}

          {plan && (
            <div className="mb-4 rounded-control border border-dashed border-line bg-inset px-4 py-3.5">
              <p className="font-display text-[14px] font-semibold text-strong">{plan.title}</p>
              {plan.scope && (
                <p className="mt-1 mb-2.5 text-[12.5px] text-muted italic">{plan.scope}</p>
              )}
              <ol className="flex list-none flex-col gap-1.5 p-0">
                {plan.subQuestions.map((q, i) => {
                  const done = steps.some(
                    (s) =>
                      s.agent === 'researcher' &&
                      s.label === 'Searching the web' &&
                      s.detail === q.question,
                  )
                  return (
                    <li
                      key={i}
                      className={cn(
                        'flex items-start gap-2.5 text-[13px]',
                        done ? 'text-fg' : 'text-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-px grid h-[19px] w-[19px] flex-none place-items-center rounded-full border text-[11px] font-bold',
                          done ? 'border-ok text-ok' : 'border-line text-muted',
                        )}
                      >
                        {done ? '✓' : i + 1}
                      </span>
                      <span className="min-w-0">
                        {q.question}
                        {q.theme && <span className="ml-1.5 text-muted/70">· {q.theme}</span>}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          <ol className="relative list-none p-0">
            {steps.map((step, i) => (
              <StepRow key={i} step={step} isLast={i === steps.length - 1} running={running} />
            ))}
          </ol>

          {steps.length === 0 && !plan && (
            <p className="text-[13px] text-muted italic">
              Waiting for the planner to decompose your question…
            </p>
          )}
        </div>
      </FadeBox>
    </Panel>
  )
}
