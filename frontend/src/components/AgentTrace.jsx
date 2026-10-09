import Panel, { PanelHead } from './ui/Panel.jsx'
import Badge from './ui/Badge.jsx'
import { cn } from '../lib/cn.js'

const AGENT_META = {
  planner: { label: 'Planner', text: 'text-planner', dot: 'bg-planner' },
  researcher: { label: 'Researcher', text: 'text-researcher', dot: 'bg-researcher' },
  writer: { label: 'Writer', text: 'text-writer', dot: 'bg-writer' },
  critic: { label: 'Critic', text: 'text-critic', dot: 'bg-critic' },
}

const FALLBACK = { label: 'Agent', text: 'text-muted', dot: 'bg-muted' }

const PHASE_LABEL = {
  plan: 'Planning',
  research: 'Researching',
  draft: 'Drafting',
  critique: 'Auditing',
  revision: 'Revising',
  audit: 'Verifying citations',
}

function StepRow({ step, isLast, running }) {
  const meta = AGENT_META[step.agent] ?? { ...FALLBACK, label: step.agent }
  const pending = step.status === 'start' && isLast && running

  return (
    <li
      className={cn(
        'relative flex gap-3 pb-4',
        !isLast &&
          "before:absolute before:top-4 before:bottom-0 before:left-[5px] before:w-px before:bg-line before:content-['']",
      )}
    >
      <span
        className={cn(
          'mt-[5px] h-[11px] w-[11px] flex-none rounded-full',
          meta.dot,
          pending && 'animate-[pulse_1.3s_ease-in-out_infinite]',
        )}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={cn('text-[11px] font-bold tracking-[0.06em] uppercase', meta.text)}>
            {meta.label}
          </span>
          <span className="text-[13.5px] text-strong">{step.label}</span>
        </div>
        {step.detail && (
          <p className="mt-0.5 text-[12.5px] break-words text-muted">{step.detail}</p>
        )}
      </div>
    </li>
  )
}

export default function AgentTrace({ steps, plan, statusMessage, phase, running }) {
  return (
    <Panel>
      <PanelHead title="Agent activity">
        {running && phase && (
          <Badge tone="neutral">{PHASE_LABEL[phase] ?? phase}</Badge>
        )}
        {running && (
          <Badge tone="accent" className="border-transparent bg-transparent px-0">
            <span className="h-[7px] w-[7px] rounded-full bg-accent-2 animate-[pulse_1.3s_ease-in-out_infinite]" />
            live
          </Badge>
        )}
      </PanelHead>

      {statusMessage && <p className="mb-3.5 text-[13px]">{statusMessage}</p>}

      {plan && (
        <div className="mb-4 rounded-control border border-dashed border-line bg-inset px-[15px] py-3">
          <p className="mb-2.5 text-[13px] font-semibold text-strong">{plan.title}</p>
          {plan.scope && <p className="mb-2.5 text-[12px] text-muted italic">{plan.scope}</p>}
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
                    {q.theme && (
                      <span className="ml-1.5 text-muted/70">· {q.theme}</span>
                    )}
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
    </Panel>
  )
}
