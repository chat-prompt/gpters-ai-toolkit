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
import { HeaderNavMenu, type HeaderNavItem } from './HeaderNavMenu'
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

  // 탭 목록은 한 곳에서만 만들고 데스크톱 줄과 접이식 메뉴가 함께 쓴다.
  const navItems: HeaderNavItem[] = [
    { href: '/getting-started', label: t('tutorial'), active: isStartTab },
    { href: '/', label: t('catalog'), active: isCatalogTab },
    { href: '/guides', label: t('guides'), active: isGuidesTab },
    ...(canViewAx ? [{ href: '/ax', label: t('ax'), active: isAxTab }] : []),
    ...(canViewStats ? [{ href: '/stats', label: t('stats'), active: isStatsTab }] : []),
  ]

  return (
    <header className="sticky top-0 z-[1010] border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/85 backdrop-blur-md">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 xl:px-10">
        <div className="flex items-center justify-between gap-4">
          {/* Logo & Nav */}
          <div className="flex min-w-0 items-center gap-3 xl:gap-8">
            <Link href="/" className="flex min-h-11 flex-shrink-0 items-center gap-3 xl:min-h-0">
              <Image
                src="/gpters-logo.png"
                alt="AI Toolkit"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="hidden whitespace-nowrap text-lg font-medium text-[var(--text-primary)] xl:inline">
                AI Toolkit
              </span>
            </Link>

            {/* 좁은 화면에서는 같은 탭 목록을 하나의 메뉴로 접는다 */}
            <HeaderNavMenu items={navItems} label={t('menu')} />

            {/* Tab Navigation — 탭이 늘어도 헤더가 넘치지 않도록 줄어들 수 있게 둔다 */}
            <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto lg:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-full px-2 py-1.5 text-xs transition-colors duration-200 xl:px-3.5 xl:text-sm ${
                    item.active
                      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Actions */}
          <div className="flex flex-shrink-0 items-center gap-1.5 xl:gap-3">
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
