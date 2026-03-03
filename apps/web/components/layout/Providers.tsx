/**
 * Root providers wrapper for client-side context providers
 *
 * Combines SessionProvider (NextAuth), ThemeProvider, and ToastProvider
 * into a single wrapper component for the app layout.
 */
'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog'

/**
 * Combined provider wrapper for app-wide contexts
 *
 * Order of providers:
 * 1. SessionProvider - NextAuth session management
 * 2. ThemeProvider - Dark/light/system theme
 * 3. ToastProvider - Toast notifications
 * 4. ConfirmDialogProvider - Confirm dialogs
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * <Providers>{children}</Providers>
 * ```
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
