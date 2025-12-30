'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

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

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
