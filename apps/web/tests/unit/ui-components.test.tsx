/**
 * Tests for UI Components: Toast, ThemeProvider, Skeleton
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React, { type ReactNode } from 'react'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: query.includes('dark'),
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', { value: matchMediaMock })

describe('Toast System', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Toast Types', () => {
    it('should export Toast types correctly', async () => {
      const ToastModule = await import('@/components/ui/Toast')
      expect(ToastModule.ToastProvider).toBeDefined()
      expect(ToastModule.useToast).toBeDefined()
    })
  })

  describe('useToast hook', () => {
    it('should throw error when used outside ToastProvider', async () => {
      const { useToast } = await import('@/components/ui/Toast')

      expect(() => {
        renderHook(() => useToast())
      }).toThrow('useToast must be used within a ToastProvider')
    })

    it('should provide toast functions when used within ToastProvider', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      expect(result.current.toasts).toEqual([])
      expect(typeof result.current.addToast).toBe('function')
      expect(typeof result.current.removeToast).toBe('function')
      expect(typeof result.current.success).toBe('function')
      expect(typeof result.current.error).toBe('function')
      expect(typeof result.current.info).toBe('function')
      expect(typeof result.current.warning).toBe('function')
    })

    it('should add toast with success type', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.success('Test success message')
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].type).toBe('success')
      expect(result.current.toasts[0].message).toBe('Test success message')
    })

    it('should add toast with error type', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.error('Test error message')
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].type).toBe('error')
    })

    it('should add toast with info type', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.info('Test info message')
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].type).toBe('info')
    })

    it('should add toast with warning type', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.warning('Test warning message')
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].type).toBe('warning')
    })

    it('should remove toast by id', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      let toastId: string
      act(() => {
        toastId = result.current.success('Test message')
      })

      expect(result.current.toasts).toHaveLength(1)

      act(() => {
        result.current.removeToast(toastId)
      })

      expect(result.current.toasts).toHaveLength(0)
    })

    it('should support multiple toasts (stacking)', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.success('Message 1')
        result.current.error('Message 2')
        result.current.info('Message 3')
      })

      expect(result.current.toasts).toHaveLength(3)
    })

    it('should support action button in toast', async () => {
      const { ToastProvider, useToast } = await import('@/components/ui/Toast')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ToastProvider>{children}</ToastProvider>
      )

      const { result } = renderHook(() => useToast(), { wrapper })

      const actionFn = vi.fn()
      act(() => {
        result.current.success('With action', {
          action: { label: 'Undo', onClick: actionFn },
        })
      })

      expect(result.current.toasts[0].action).toBeDefined()
      expect(result.current.toasts[0].action?.label).toBe('Undo')
    })
  })
})

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorageMock.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('theme-transition')
  })

  describe('useTheme hook', () => {
    it('should throw error when used outside ThemeProvider', async () => {
      const { useTheme } = await import('@/components/layout/ThemeProvider')

      expect(() => {
        renderHook(() => useTheme())
      }).toThrow('useTheme must be used within a ThemeProvider')
    })

    it('should provide theme functions when used within ThemeProvider', async () => {
      const { ThemeProvider, useTheme } = await import('@/components/layout/ThemeProvider')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ThemeProvider>{children}</ThemeProvider>
      )

      const { result } = renderHook(() => useTheme(), { wrapper })

      expect(result.current.theme).toBeDefined()
      expect(result.current.resolvedTheme).toBeDefined()
      expect(typeof result.current.setTheme).toBe('function')
      expect(typeof result.current.toggleTheme).toBe('function')
    })

    it('should toggle theme through dark -> light -> system cycle', async () => {
      const { ThemeProvider, useTheme } = await import('@/components/layout/ThemeProvider')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ThemeProvider>{children}</ThemeProvider>
      )

      const { result } = renderHook(() => useTheme(), { wrapper })

      // Set initial theme to dark
      act(() => {
        result.current.setTheme('dark')
      })
      expect(result.current.theme).toBe('dark')

      // Toggle to light
      act(() => {
        result.current.toggleTheme()
      })
      expect(result.current.theme).toBe('light')

      // Toggle to system
      act(() => {
        result.current.toggleTheme()
      })
      expect(result.current.theme).toBe('system')

      // Toggle back to dark
      act(() => {
        result.current.toggleTheme()
      })
      expect(result.current.theme).toBe('dark')
    })

    it('should set theme directly', async () => {
      const { ThemeProvider, useTheme } = await import('@/components/layout/ThemeProvider')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <ThemeProvider>{children}</ThemeProvider>
      )

      const { result } = renderHook(() => useTheme(), { wrapper })

      act(() => {
        result.current.setTheme('light')
      })
      expect(result.current.theme).toBe('light')

      act(() => {
        result.current.setTheme('dark')
      })
      expect(result.current.theme).toBe('dark')

      act(() => {
        result.current.setTheme('system')
      })
      expect(result.current.theme).toBe('system')
    })
  })
})

describe('Skeleton Components', () => {
  it('should export all skeleton components', async () => {
    const SkeletonModule = await import('@/components/ui/Skeleton')

    expect(SkeletonModule.Skeleton).toBeDefined()
    expect(SkeletonModule.SkeletonCard).toBeDefined()
    expect(SkeletonModule.SkeletonText).toBeDefined()
    expect(SkeletonModule.SkeletonHeader).toBeDefined()
    expect(SkeletonModule.SkeletonDetailHero).toBeDefined()
    expect(SkeletonModule.SkeletonActionCard).toBeDefined()
    expect(SkeletonModule.SkeletonContent).toBeDefined()
    expect(SkeletonModule.SkeletonListPage).toBeDefined()
    expect(SkeletonModule.SkeletonTable).toBeDefined()
    expect(SkeletonModule.SkeletonSidebar).toBeDefined()
    expect(SkeletonModule.SkeletonAvatar).toBeDefined()
  })
})
