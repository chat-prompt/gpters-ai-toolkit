/**
 * Admin layout
 *
 * Layout wrapper for admin pages providing navigation sidebar,
 * role-based access control, and authentication state management.
 */
'use client'

import { ReactNode } from 'react'
import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import { usePathname } from '@/i18n/navigation'
import { useSession, signIn } from 'next-auth/react'
import { AdminAuthProvider, useAdminAuth } from '@/components/admin/AdminAuthProvider'
import type { UserRole } from '@/lib/security/rbac'

/**
 * 역할 배지 — 알약 배경 대신 점 하나와 글자로 표시한다.
 * 권한이 높을수록 눈에 띄는 점 색을 쓴다.
 */
function RoleBadge({ role }: { role: UserRole }) {
  const dotTone: Record<UserRole, string> = {
    super_admin: 'bg-[var(--accent-orange)]',
    admin: 'bg-[var(--accent-orange)]',
    editor: 'bg-[var(--text-secondary)]',
    viewer: 'bg-[var(--text-muted)]',
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
      <span className={`size-1.5 shrink-0 rounded-full ${dotTone[role]}`} />
      {role}
    </span>
  )
}

const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

const DEV_SESSION_USER = {
  name: 'Dev User',
  email: 'dev@gpters.org',
  image: null,
}

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, userRole, logout } = useAdminAuth()
  const { data: session } = useSession()
  const pathname = usePathname()

  const effectiveUser = DEV_BYPASS_AUTH ? DEV_SESSION_USER : session?.user

  if (isLoading) {
    return (
      <div className="page-shell items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (!effectiveUser) {
    return (
      <div className="page-shell items-center justify-center">
        <div className="surface-card w-full max-w-md rounded-2xl p-8 text-center">
          <h1 className="page-title mb-4">
            Admin Dashboard
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">
            Please sign in to access the admin dashboard.
          </p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/admin' })}
            className="w-full py-3 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  // Logged in but no admin role - show access denied
  if (!isAuthenticated) {
    return (
      <div className="page-shell items-center justify-center">
        <div className="surface-card w-full max-w-md rounded-2xl p-8 text-center">
          <h1 className="page-title mb-4">
            Access Denied
          </h1>
          <p className="text-[var(--text-secondary)] mb-2">
            You don&apos;t have permission to access the admin dashboard.
          </p>
          <p className="text-[var(--text-muted)] text-sm mb-6">
            Signed in as: {effectiveUser?.email}
          </p>
          <div className="flex gap-3">
            <Link
              href="/"
              className="flex-1 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium hover:opacity-90 transition-opacity text-center"
            >
              Go Home
            </Link>
            <button
              onClick={() => logout()}
              className="flex-1 py-3 rounded-lg border border-[var(--accent-orange)]/30 text-[var(--accent-orange)] font-medium hover:bg-[var(--accent-orange)]/10 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/catalog', label: 'Catalog' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/organizations', label: 'Organizations' },
  ]

  return (
    <div className="page-shell">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="text-lg font-medium text-[var(--text-primary)]">
              Admin
            </Link>
            <nav className="flex items-center gap-6">
              {navItems.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm transition-colors border-b-2 -mb-px pb-px ${
                      isActive
                        ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {/* User info and role badge */}
            {effectiveUser && (
              <div className="flex items-center gap-2">
                {effectiveUser.image && (
                  <Image
                    src={effectiveUser.image}
                    alt={effectiveUser.name || 'User'}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                )}
                <span className="text-sm text-[var(--text-secondary)]">
                  {effectiveUser.name || effectiveUser.email}
                </span>
                {userRole && <RoleBadge role={userRole} />}
              </div>
            )}
            <Link
              href="/"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              View Site
            </Link>
            <button
              onClick={() => logout()}
              className="text-sm text-[var(--accent-orange)] hover:opacity-80"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="page-main">
        {children}
      </main>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminAuthProvider>
  )
}
