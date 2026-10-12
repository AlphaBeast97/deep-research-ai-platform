import { cn } from '../../lib/cn.js'

const TONES = {
  accent: 'border-accent/35 bg-accent/12 text-accent',
  ok: 'border-ok/35 bg-ok/12 text-ok',
  warn: 'border-warn/40 bg-warn/12 text-warn',
  danger: 'border-danger/40 bg-danger/12 text-danger',
  neutral: 'border-line bg-surface-2 text-muted',
}

/** Compact pill for mode flags, counts and statuses. */
export default function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-[11.5px] font-semibold',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
