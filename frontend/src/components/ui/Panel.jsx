import { cn } from '../../lib/cn.js'

/** Card surface used by every major section of the app. */
export default function Panel({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag
      className={cn(
        'rounded-panel border border-line bg-surface p-[18px] shadow-panel',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

/** Uppercase panel header with an optional right-aligned slot. */
export function PanelHead({ title, children, className }) {
  return (
    <header
      className={cn('mb-3.5 flex items-center justify-between gap-3', className)}
    >
      <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
        {title}
      </h2>
      {children}
    </header>
  )
}
