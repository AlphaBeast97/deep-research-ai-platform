import Panel, { PanelHead } from './ui/Panel.jsx'
import Badge from './ui/Badge.jsx'
import { cn } from '../lib/cn.js'
import { hostOf } from '../lib/format.js'

export default function SourcesPanel({ sources, uncited = [] }) {
  const uncitedSet = new Set(uncited)

  return (
    <Panel>
      <PanelHead title="Sources">
        <div className="flex items-center gap-1.5">
          {uncited.length > 0 && <Badge tone="warn">{uncited.length} uncited</Badge>}
          <Badge tone="accent">{sources.length}</Badge>
        </div>
      </PanelHead>

      {sources.length === 0 ? (
        <p className="text-[13px] text-muted italic">
          Sources will appear here as the agents find them.
        </p>
      ) : (
        <ol className="flex max-h-[62vh] list-none flex-col gap-2.5 overflow-y-auto py-1 pr-0.5">
          {sources.map((s) => {
            const isUncited = uncitedSet.has(s.index)
            return (
              <li
                key={s.id ?? s.url}
                id={`source-${s.index}`}
                className={cn(
                  'source-card enter flex gap-2.5 rounded-control border border-line-soft p-2.5 transition duration-200',
                  isUncited
                    ? 'bg-inset/60'
                    : 'bg-inset hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'grid h-[22px] w-[22px] flex-none place-items-center rounded-lg text-[11.5px] font-bold',
                    isUncited ? 'bg-muted/12 text-muted' : 'bg-accent/12 text-accent',
                  )}
                >
                  {s.index}
                </span>
                <div className="min-w-0">
                  <a
                    className={cn(
                      'block text-[13px] font-medium break-words no-underline transition-colors',
                      isUncited ? 'text-muted' : 'text-strong hover:text-accent',
                    )}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.title}
                  </a>
                  <span className="text-[11.5px] text-muted">{hostOf(s.url)}</span>
                  {s.snippet && (
                    <p className="mt-1 line-clamp-3 text-[12px] leading-[1.5] text-muted">
                      {s.snippet}
                    </p>
                  )}
                  {isUncited && (
                    <p className="mt-1 text-[11px] text-muted italic">
                      Found but not cited in the report
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
