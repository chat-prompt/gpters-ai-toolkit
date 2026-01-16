/**
 * Theme toggle button with visual indicator
 *
 * Cycles through dark, light, and system themes with appropriate icons.
 * Shows a dot indicator when system theme is active.
 */
'use client'

import { useTheme } from './ThemeProvider'
import { useEffect, useState } from 'react'

/**
 * Theme toggle button component
 *
 * Displays the current theme state with an icon and cycles through
 * themes on click: dark -> light -> system -> dark.
 *
 * @example
 * ```tsx
 * <ThemeToggle />
 * ```
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration pattern
    setMounted(true)
  }, [])

  const getNextTheme = () => {
    if (theme === 'dark') return 'light'
    if (theme === 'light') return 'system'
    return 'dark'
  }

  const getLabel = () => {
    if (theme === 'dark') return 'Dark mode'
    if (theme === 'light') return 'Light mode'
    return 'System'
  }

  if (!mounted) {
    return (
      <button
        className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center"
        aria-label="Toggle theme"
      >
        <span className="w-5 h-5" />
      </button>
    )
  }

  // Icons for each state
  const SunIcon = (
    <svg
      className="w-5 h-5 text-[var(--text-secondary)]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  )

  const MoonIcon = (
    <svg
      className="w-5 h-5 text-[var(--text-secondary)]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  )

  const SystemIcon = (
    <svg
      className="w-5 h-5 text-[var(--text-secondary)]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  )

  const getIcon = () => {
    if (theme === 'system') return SystemIcon
    return resolvedTheme === 'dark' ? MoonIcon : SunIcon
  }

  return (
    <button
      onClick={toggleTheme}
      className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-hover)] flex items-center justify-center transition-colors relative group"
      aria-label={`Current: ${getLabel()}. Click to switch to ${getNextTheme()} mode`}
      title={`${getLabel()} - Click to switch`}
    >
      {getIcon()}
      {theme === 'system' && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--accent-cyan)] border border-[var(--bg-tertiary)]" />
      )}
    </button>
  )
}
