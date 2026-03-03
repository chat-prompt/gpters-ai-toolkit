'use client'

/**
 * Confirm dialog component and hook
 *
 * Replaces native browser `confirm()` with a styled glassmorphism dialog.
 * Provides `useConfirmDialog()` hook that returns a Promise-based `confirm()` function.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type MutableRefObject,
} from 'react'

// ============================================================================
// Types
// ============================================================================

/** Visual variant of the confirm dialog */
type ConfirmVariant = 'danger' | 'default'

/**
 * Options for the confirm dialog
 */
interface ConfirmOptions {
  /** Dialog title */
  title: string
  /** Dialog description/message */
  description: string
  /** Visual variant */
  variant?: ConfirmVariant
  /** Confirm button label */
  confirmLabel?: string
  /** Cancel button label */
  cancelLabel?: string
}

interface ConfirmState extends ConfirmOptions {
  /** Whether the dialog is open */
  open: boolean
  /** Loading state for the confirm button */
  loading: boolean
}

interface ConfirmDialogContextType {
  /** Show a confirm dialog and return a promise that resolves to true/false */
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | undefined>(undefined)

// ============================================================================
// Provider
// ============================================================================

/**
 * Confirm dialog provider
 *
 * Wrap your app with this provider to enable the `useConfirmDialog()` hook.
 *
 * @example
 * ```tsx
 * <ConfirmDialogProvider>
 *   <App />
 * </ConfirmDialogProvider>
 * ```
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    loading: false,
    title: '',
    description: '',
  })

  const resolveRef: MutableRefObject<((value: boolean) => void) | null> = useRef(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({
        open: true,
        loading: false,
        ...options,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    resolveRef.current = null
    setState((prev) => ({ ...prev, open: false }))
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    resolveRef.current = null
    setState((prev) => ({ ...prev, open: false }))
  }, [])

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <ConfirmDialogOverlay
          title={state.title}
          description={state.description}
          variant={state.variant}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmDialogContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to show a confirm dialog
 *
 * Returns a `confirm()` function that shows a styled dialog and returns
 * a Promise resolving to `true` (confirmed) or `false` (cancelled).
 *
 * @example
 * ```tsx
 * const { confirm } = useConfirmDialog()
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: '삭제 확인',
 *     description: '정말 삭제하시겠습니까?',
 *     variant: 'danger',
 *     confirmLabel: '삭제',
 *   })
 *   if (!confirmed) return
 *   // proceed with deletion
 * }
 * ```
 *
 * @throws Error if used outside of ConfirmDialogProvider
 */
export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext)
  if (context === undefined) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider')
  }
  return context
}

// ============================================================================
// Internal Components
// ============================================================================

interface ConfirmDialogOverlayProps {
  title: string
  description: string
  variant?: ConfirmVariant
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Internal overlay component for the confirm dialog
 */
function ConfirmDialogOverlay({
  title,
  description,
  variant = 'default',
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: ConfirmDialogOverlayProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const isDanger = variant === 'danger'

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-sm glass rounded-2xl p-6 animate-fade-up shadow-2xl">
        <h3
          id="confirm-dialog-title"
          className="text-lg font-medium text-[var(--text-primary)] mb-2"
        >
          {title}
        </h3>
        <p
          id="confirm-dialog-description"
          className="text-sm text-[var(--text-muted)] mb-6"
        >
          {description}
        </p>

        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm font-medium border border-[var(--border-subtle)] transition-all duration-200 hover:bg-[var(--bg-secondary)] cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 cursor-pointer ${
              isDanger
                ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                : 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
