/**
 * Client-side header component with navigation and user actions
 *
 * Renders the main navigation header with tab navigation, theme toggle,
 * user menu, and admin controls based on user authentication state.
 */
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { UpdateNotificationBell } from '../actions/UpdateNotificationBell'
import { MCPStatus } from '../features/mcp/MCPStatus'
import { AdminQuickMenu } from '../admin/AdminQuickMenu'
import type { UserRole } from '@/lib/security/rbac'

/**
 * Props for the Header component
 */
interface HeaderProps {
  /** Authenticated user information (optional) */
  user?: {
    /** User's display name */
    name?: string | null
    /** User's email address */
    email?: string | null
    /** User's avatar image URL */
    image?: string | null
    /** User's RBAC role */
    role?: UserRole
  } | null
}

/**
 * Main navigation header with tab-style navigation
 *
 * Features:
 * - Logo with home link
 * - Tab navigation (Getting Started, Catalog, Guides, Prompts, Stats)
 * - MCP server status indicator
 * - Theme toggle
 * - Update notification bell (authenticated users)
 * - Admin quick menu (authorized users)
 * - Share button
 * - User dropdown menu
 *
 * @example
 * ```tsx
 * <Header user={session?.user} />
 * ```
 */
export function Header({ user }: HeaderProps) {
  const pathname = usePathname()

  const isGuidesTab = pathname.startsWith('/guides')
  const isStartTab = pathname.startsWith('/getting-started')
  const isPromptsTab = pathname.startsWith('/prompts')
  const isStatsTab = pathname.startsWith('/stats')
  const isCatalogTab = !isGuidesTab && !isStartTab && !isPromptsTab && !isStatsTab && pathname !== '/upload'

  return (
    <header className="relative z-[1010] border-b border-[var(--border-subtle)]">
      <div className="max-w-7xl mx-auto px-8 py-5">
        <div className="flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 flex-shrink-0">
              <Image
                src="/gpters-logo.svg"
                alt="GPTers"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-lg font-medium text-[var(--text-primary)] whitespace-nowrap">
                AI Toolkit
              </span>
            </Link>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 flex-shrink-0">
              <Link
                href="/getting-started"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isStartTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                시작하기
              </Link>
              <Link
                href="/"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isCatalogTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Catalog
              </Link>
              <Link
                href="/guides"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isGuidesTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Guides
              </Link>
              <Link
                href="/prompts"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isPromptsTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Prompts
              </Link>
              <Link
                href="/stats"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isStatsTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                Stats
              </Link>
            </nav>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <MCPStatus />
            <ThemeToggle />
            {user && <UpdateNotificationBell />}
            {user && <AdminQuickMenu userRole={user.role} />}
            <Link
              href="/upload"
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[#F26522] text-white hover:bg-[#E55A1B] transition-colors"
            >
              Share
            </Link>
            {user && <UserMenu user={user} />}
          </div>
        </div>
      </div>
    </header>
  )
}
