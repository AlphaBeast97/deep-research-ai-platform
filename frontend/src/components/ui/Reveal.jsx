import { m, useReducedMotion } from 'motion/react'

/** Where a revealed element starts, per direction. */
const FROM = {
  up: { x: 0, y: 18 },
  left: { x: -20, y: 0 },
  right: { x: 20, y: 0 },
}

/**
 * Fades and slides its children in the first time they scroll into view — the
 * landing assembles itself as you read, rather than arriving all at once.
 *
 * Built on `motion`'s `m` component, which pairs with the `LazyMotion` in
 * `main.jsx` to pull in only the ~15 kB `domAnimation` feature set rather than
 * the whole library. Under `prefers-reduced-motion` nothing animates: the
 * element is rendered plainly rather than quickly.
 */
export default function Reveal({
  as = 'div',
  from = 'up',
  delay = 0,
  className,
  children,
  ...props
}) {
  const reduce = useReducedMotion()
  const Tag = m[as] ?? m.div

  if (reduce) {
    return (
      <Tag className={className} {...props}>
        {children}
      </Tag>
    )
  }

  return (
    <Tag
      initial={{ opacity: 0, ...FROM[from] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: [0.22, 0.61, 0.36, 1] }}
      className={className}
      {...props}
    >
      {children}
    </Tag>
  )
}
