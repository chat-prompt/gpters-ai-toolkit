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

interface HeaderProps {
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: UserRole
  } | null
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()

  const isGuidesTab = pathname.startsWith('/guides')
  const isStartTab = pathname.startsWith('/getting-started')
  const isPromptsTab = pathname.startsWith('/prompts')
  const isStatsTab = pathname.startsWith('/stats')
  const isCatalogTab = !isGuidesTab && !isStartTab && !isPromptsTab && !isStatsTab && pathname !== '/upload'

  return (
    <header className="relative z-[1010] border-b border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto px-8 py-5">
        <div className="flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/gpters-logo.svg"
                alt="GPTers"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-lg font-medium text-[var(--text-primary)]">
                AI Toolkit
              </span>
            </Link>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-xl p-1">
              <Link
                href="/getting-started"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
