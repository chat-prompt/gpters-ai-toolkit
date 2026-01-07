/**
 * Toast notification system
 *
 * Provides a context-based toast notification system with support for
 * success, error, info, and warning messages with auto-dismiss.
 */
'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'

// ============================================================================
// Types
// ============================================================================

/** Available toast notification types */
type ToastType = 'success' | 'error' | 'info' | 'warning'

/**
 * Optional action button for toast notifications
 */
interface ToastAction {
  /** Button label text */
  label: string
  /** Click handler for the action */
  onClick: () => void
}

/**
 * Toast notification data structure
 */
interface Toast {
  /** Unique identifier for the toast */
  id: string
  /** Visual style and icon type */
  type: ToastType
  /** Message content to display */
  message: string
  /** Auto-dismiss duration in milliseconds */
  duration?: number
  /** Optional action button */
  action?: ToastAction
}

/**
 * Toast context value with state and helper methods
 */
interface ToastContextType {
  /** Currently active toasts */
  toasts: Toast[]
  /** Add a new toast notification */
  addToast: (toast: Omit<Toast, 'id'>) => string
  /** Remove a toast by ID */
  removeToast: (id: string) => void
  /** Show a success toast (4s default) */
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => string
  /** Show an error toast (6s default) */
  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => string
  /** Show an info toast (4s default) */
  info: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => string
  /** Show a warning toast (5s default) */
  warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => string
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

// ============================================================================
// Provider
// ============================================================================

/**
 * Toast notification provider
 *
 * Wrap your app with this provider to enable toast notifications.
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setToasts((prev) => [...prev, { ...toast, id }])
    return id
  }, [])

  const success = useCallback(
    (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
      return addToast({ type: 'success', message, duration: 4000, ...options })
    },
    [addToast]
  )

  const error = useCallback(
    (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
      return addToast({ type: 'error', message, duration: 6000, ...options })
    },
    [addToast]
  )

  const info = useCallback(
    (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
      return addToast({ type: 'info', message, duration: 4000, ...options })
    },
    [addToast]
  )

  const warning = useCallback(
    (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
      return addToast({ type: 'warning', message, duration: 5000, ...options })
    },
    [addToast]
  )

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, info, warning }}
    >
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access toast notifications
 *
 * Must be used within a ToastProvider.
 *
 * @example
 * ```tsx
 * const { success, error } = useToast()
 * success('Operation completed!')
 * error('Something went wrong')
 * ```
 *
 * @throws Error if used outside of ToastProvider
 */
export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// ============================================================================
// Internal Components
// ============================================================================

/**
 * Container component for rendering active toasts
 */
function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[]
  onRemove: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

/**
 * Individual toast notification item with animation support
 */
function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast
  onRemove: (id: string) => void
}) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true)
        setTimeout(() => onRemove(toast.id), 200)
      }, toast.duration)

      return () => clearTimeout(timer)
    }
  }, [toast.id, toast.duration, onRemove])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => onRemove(toast.id), 200)
  }

  const icons: Record<ToastType, ReactNode> = {
    success: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  }

  const styles: Record<ToastType, string> = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-[var(--accent-cyan)]/10 border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)]',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  }

  const iconBg: Record<ToastType, string> = {
    success: 'bg-emerald-500/20',
    error: 'bg-red-500/20',
    info: 'bg-[var(--accent-cyan)]/20',
    warning: 'bg-amber-500/20',
  }

  return (
    <div
      className={`
        pointer-events-auto glass rounded-xl p-4 border shadow-lg
        transform transition-all duration-200 ease-out
        ${styles[toast.type]}
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${iconBg[toast.type]}`}>
          {icons[toast.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {toast.message}
          </p>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick()
                handleClose()
              }}
              className="mt-2 text-xs font-medium underline underline-offset-2 hover:no-underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-1 rounded hover:bg-[var(--border-subtle)] transition-colors"
          aria-label="Close notification"
        >
          <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
