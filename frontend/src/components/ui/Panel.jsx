import { cn } from '../../lib/cn.js'

/** Card surface used by every major section of the app. */
export default function Panel({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag
      className={cn('rounded-panel border border-line bg-surface p-5 shadow-panel', className)}
      {...props}
    >
      {children}
    </Tag>
  )
}

/** Panel header: a quiet editorial label with an optional right-aligned slot. */
export function PanelHead({ title, children, className }) {
  return (
    <header className={cn('mb-4 flex items-center justify-between gap-3', className)}>
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-strong">
        {title}
      </h2>
      {children}
    </header>
  )
}
