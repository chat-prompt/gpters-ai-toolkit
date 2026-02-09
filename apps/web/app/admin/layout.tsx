/**
 * Admin layout
 *
 * Layout wrapper for admin pages providing navigation sidebar,
 * role-based access control, and authentication state management.
 */
'use client'

import { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { AdminAuthProvider, useAdminAuth } from '@/components/admin/AdminAuthProvider'
import type { UserRole } from '@/lib/security/rbac'

// Role badge component
function RoleBadge({ role }: { role: UserRole }) {
  const colors: Record<UserRole, string> = {
    super_admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    admin: 'bg-red-500/20 text-red-400 border-red-500/30',
    editor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    viewer: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[role]}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
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
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (!effectiveUser) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="glass rounded-2xl p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-light text-[var(--text-primary)] mb-4">
            Admin Dashboard
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">
            Please sign in to access the admin dashboard.
          </p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/admin' })}
            className="w-full py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
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
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="glass rounded-2xl p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-light text-[var(--text-primary)] mb-4">
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
              className="flex-1 py-3 rounded-lg border border-red-500/30 text-red-400 font-medium hover:bg-red-500/10 transition-colors"
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
    <div className="min-h-screen grid-pattern noise-overlay">
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
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
                    className={`text-sm transition-colors ${
                      isActive
                        ? 'text-[var(--accent-cyan)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
              className="text-sm text-red-400 hover:text-red-300"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
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
