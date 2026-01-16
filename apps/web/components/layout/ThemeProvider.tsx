/**
 * Theme provider with dark/light/system mode support
 *
 * Manages theme state with localStorage persistence, system preference
 * detection, and smooth theme transitions.
 */
'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

/** Available theme options */
type Theme = 'dark' | 'light' | 'system'

/** Resolved theme after system preference is applied */
type ResolvedTheme = 'dark' | 'light'

/**
 * Theme context value type
 */
interface ThemeContextType {
  /** Current theme setting (may be 'system') */
  theme: Theme
  /** Actual applied theme (dark or light) */
  resolvedTheme: ResolvedTheme
  /** Set the theme preference */
  setTheme: (theme: Theme) => void
  /** Cycle through themes: dark -> light -> system */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * Get the system's preferred color scheme
 *
 * @returns 'dark' or 'light' based on prefers-color-scheme media query
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme provider component with localStorage persistence
 *
 * Features:
 * - Persists theme choice to localStorage
 * - Respects system color scheme preference
 * - Smooth transitions between themes
 * - Listens for system preference changes
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')
  const [mounted, setMounted] = useState(false)

  // Resolve theme based on system preference
  const resolveTheme = useCallback((themeValue: Theme): ResolvedTheme => {
    if (themeValue === 'system') {
      return getSystemTheme()
    }
    return themeValue
  }, [])

  // Apply theme with transition
  const applyTheme = useCallback((newResolvedTheme: ResolvedTheme) => {
    // Add transition class
    document.documentElement.classList.add('theme-transition')
    document.documentElement.setAttribute('data-theme', newResolvedTheme)

    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition')
    }, 300)
  }, [])

  // Initial mount - read from localStorage
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration pattern for client-only localStorage
    setMounted(true)
    const stored = localStorage.getItem('theme') as Theme | null

    if (stored && ['dark', 'light', 'system'].includes(stored)) {
      setThemeState(stored)
      const resolved = resolveTheme(stored)
      setResolvedTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
    } else {
      // Default to system
      const resolved = getSystemTheme()
      setResolvedTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
    }
  }, [resolveTheme])

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (theme === 'system') {
        const newResolved = getSystemTheme()
        setResolvedTheme(newResolved)
        applyTheme(newResolved)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, mounted, applyTheme])

  // Update when theme changes
  useEffect(() => {
    if (mounted) {
      const resolved = resolveTheme(theme)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Theme sync pattern requires state update
      setResolvedTheme(resolved)
      applyTheme(resolved)
      localStorage.setItem('theme', theme)
    }
  }, [theme, mounted, resolveTheme, applyTheme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    // Cycle through: dark -> light -> system -> dark
    setThemeState((prev) => {
      if (prev === 'dark') return 'light'
      if (prev === 'light') return 'system'
      return 'dark'
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access theme context
 *
 * @returns Theme context with theme, resolvedTheme, setTheme, and toggleTheme
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * const { theme, toggleTheme } = useTheme()
 * ```
 */
export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
