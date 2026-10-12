import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn.js'

/**
 * Fades and slides its children into view the first time they scroll into
 * range — used for the landing's entrance, so the page assembles itself as you
 * read rather than arriving all at once.
 *
 * IntersectionObserver only (no dependency), and the motion itself lives in CSS
 * so `prefers-reduced-motion` can switch it off in one place. Without an
 * observer (a test environment, or an old browser) the content simply shows.
 */
export default function Reveal({
  as: Tag = 'div',
  from = 'up',
  delay = 0,
  className,
  children,
  ...props
}) {
  const ref = useRef(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={cn('reveal', `reveal--${from}`, shown && 'reveal-is-in', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...props}
    >
      {children}
    </Tag>
  )
}
