import { cn } from '../../lib/cn.js'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-control border font-semibold ' +
  'transition-[background,border-color,color,transform,opacity] duration-150 ' +
  'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45'

const VARIANTS = {
  primary:
    'border-transparent bg-gradient-to-br from-accent to-violet-600 text-white shadow-lg shadow-accent/30 hover:brightness-110',
  danger: 'border-danger/45 bg-danger/15 text-danger hover:bg-danger/25',
  ghost:
    'border-line bg-surface-2 text-fg hover:border-accent hover:text-strong',
  plain: 'border-transparent bg-transparent text-muted hover:text-strong',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-[13px]',
  lg: 'px-5 py-3 text-[14.5px]',
}

/**
 * Shared button. Renders whatever element `as` names (button, a, …) so links
 * and actions stay visually identical.
 */
export default function Button({
  as: Tag = 'button',
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}) {
  return <Tag className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />
}
