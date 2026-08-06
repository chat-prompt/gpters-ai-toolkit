/**
 * Client-side header component with navigation and user actions
 *
 * Renders the main navigation header with tab navigation, theme toggle,
 * user menu, and admin controls based on user authentication state.
 */
'use client'

import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { OrgSwitcher } from './OrgSwitcher'
import { UpdateNotificationBell } from '../actions/UpdateNotificationBell'
import { AdminQuickMenu } from '../admin/AdminQuickMenu'
import { LocaleSwitcher } from './LocaleSwitcher'
import type { UserRole } from '@/lib/security/rbac'

/** Roles that can access the stats page */
const STATS_ROLES: UserRole[] = ['super_admin', 'admin', 'editor']

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
  /**
   * Whether this user may open the AX dashboard.
   *
   * Decided on the server (the internal-domain check is server-only),
   * so the tab is hidden rather than bouncing the user back home.
   * Defaults to false — callers that do not pass it show no AX tab.
   */
  canViewAx?: boolean
}

/**
 * Main navigation header with tab-style navigation
 *
 * Features:
 * - Logo with home link
 * - Tab navigation (Getting Started, Catalog, Guides, AX Dashboard, Stats)
 * - Theme toggle
 * - Update notification bell (authenticated users)
 * - Admin quick menu (authorized users)
 * - Share button
 * - User dropdown menu
 *
 * @example
 * ```tsx
 * <Header user={session?.user} canViewAx={canViewAx} />
 * ```
 */
export function Header({ user, canViewAx = false }: HeaderProps) {
  const pathname = usePathname()
  const t = useTranslations('common.nav')

  const isGuidesTab = pathname.startsWith('/guides')
  const isStartTab = pathname.startsWith('/getting-started')
  const isStatsTab = pathname.startsWith('/stats')
  const isAxTab = pathname.startsWith('/ax')
  const canViewStats = user?.role && STATS_ROLES.includes(user.role)
  const isCatalogTab = !isGuidesTab && !isStartTab && !isAxTab && !(isStatsTab && canViewStats)

  return (
    <header className="sticky top-0 z-[1010] border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/85 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 flex-shrink-0">
              <Image
                src="/gpters-logo.png"
                alt="AI Toolkit"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-lg font-medium text-[var(--text-primary)] whitespace-nowrap">
                AI Toolkit
              </span>
            </Link>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-0.5 flex-shrink-0">
              <Link
                href="/getting-started"
                className={`px-3.5 py-1.5 rounded-full text-sm transition-colors duration-200 whitespace-nowrap ${
                  isStartTab
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t('tutorial')}
              </Link>
              <Link
                href="/"
                className={`px-3.5 py-1.5 rounded-full text-sm transition-colors duration-200 ${
                  isCatalogTab
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t('catalog')}
              </Link>
              <Link
                href="/guides"
                className={`px-3.5 py-1.5 rounded-full text-sm transition-colors duration-200 ${
                  isGuidesTab
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t('guides')}
              </Link>
              {canViewAx && (
                <Link
                  href="/ax"
                  className={`px-3.5 py-1.5 rounded-full text-sm transition-colors duration-200 whitespace-nowrap ${
                    isAxTab
                      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {t('ax')}
                </Link>
              )}
              {canViewStats && (
                <Link
                  href="/stats"
                  className={`px-3.5 py-1.5 rounded-full text-sm transition-colors duration-200 ${
                    isStatsTab
                      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {t('stats')}
                </Link>
              )}
            </nav>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {user && <OrgSwitcher />}
            <LocaleSwitcher />
            {user && <UpdateNotificationBell />}
            {user && <AdminQuickMenu userRole={user.role} />}
            <ThemeToggle />
            {user && <UserMenu user={user} />}
          </div>
        </div>
      </div>
    </header>
  )
}
