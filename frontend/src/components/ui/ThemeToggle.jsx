import { useState } from 'react'
import { cn } from '../../lib/cn.js'
import { readPreference, setPreference } from '../../lib/theme.js'

const icon = (paths) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[15px] w-[15px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
)

const OPTIONS = [
  {
    id: 'system',
    label: 'Follow the system theme',
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>,
    ),
  },
  {
    id: 'light',
    label: 'Light theme',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </>,
    ),
  },
  {
    id: 'dark',
    label: 'Dark theme',
    icon: icon(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />),
  },
]

/**
 * Light / dark / system. The control shows the *preference* while the document
 * carries the resolved theme; `watchTheme` keeps the two in step if the OS
 * changes underneath a `system` choice.
 */
export default function ThemeToggle({ className }) {
  const [preference, setPref] = useState(readPreference)

  const choose = (next) => {
    setPref(next)
    setPreference(next)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-full border border-line bg-inset p-0.5',
        className,
      )}
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map((option) => {
        const active = preference === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => choose(option.id)}
            className={cn(
              'grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-colors',
              active ? 'bg-surface text-accent shadow-panel' : 'text-muted hover:text-strong',
            )}
          >
            {option.icon}
          </button>
        )
      })}
    </div>
  )
}
