import { cn } from '../../lib/cn.js'

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border font-semibold ' +
  'transition-[background-color,border-color,color,transform,box-shadow] duration-200 ' +
  'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ' +
  'disabled:active:translate-y-0'

// `.btn-primary` owns its own background/colour so the label stays legible
// in both themes (the accent is light in dark mode, dark in light mode).
const VARIANTS = {
  primary: 'border-transparent btn-primary shadow-panel',
  danger: 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/20',
  ghost: 'border-line bg-surface text-fg hover:border-accent/60 hover:text-strong',
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
