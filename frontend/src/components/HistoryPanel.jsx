import Panel, { PanelHead } from './ui/Panel.jsx'
import Badge from './ui/Badge.jsx'
import { cn } from '../lib/cn.js'
import { timeAgo } from '../lib/format.js'

export default function HistoryPanel({ reports, onOpen, onDelete, activeId }) {
  return (
    <Panel>
      <PanelHead title="History">
        <Badge tone="accent">{reports.length}</Badge>
      </PanelHead>

      {reports.length === 0 ? (
        <p className="text-[13px] text-muted italic">Completed research is saved here.</p>
      ) : (
        <ul className="flex max-h-[62vh] list-none flex-col gap-2 overflow-y-auto p-0 pr-0.5">
          {reports.map((r) => (
            <li
              key={r.id}
              className={cn(
                'enter flex items-center overflow-hidden rounded-control border bg-inset transition duration-200 hover:-translate-y-0.5',
                r.id === activeId ? 'border-accent' : 'border-line-soft hover:border-accent/50',
              )}
            >
              <button
                type="button"
                className="group flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 border-none bg-transparent px-3.5 py-2.5 text-left text-inherit"
                onClick={() => onOpen(r.id)}
              >
                <span className="truncate text-[13px] font-medium text-strong transition-colors group-hover:text-accent">
                  {r.title || r.query}
                </span>
                <span className="text-[11.5px] text-muted">
                  {timeAgo(r.createdAt)} · {r.sourceCount} sources
                </span>
              </button>
              <button
                type="button"
                className="w-9 flex-none cursor-pointer self-stretch border-none border-l border-line-soft bg-transparent text-[17px] text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                aria-label="Delete report"
                onClick={() => onDelete(r.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
