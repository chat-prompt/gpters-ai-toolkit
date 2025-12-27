'use client'

import { useState, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminAuthProvider, useAdminAuth } from '@/lib/admin-auth'

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, login, logout } = useAdminAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const pathname = usePathname()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const success = await login(password)
    if (!success) {
      setError('Invalid password')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="glass rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-light text-[var(--text-primary)] mb-6">
            Admin Login
          </h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
                placeholder="Enter admin password"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/catalog', label: 'Catalog' },
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
            <Link
              href="/"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              View Site
            </Link>
            <button
              onClick={logout}
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
