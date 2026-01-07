/**
 * Admin quick access menu component
 *
 * Provides a dropdown menu with quick access to admin functions,
 * including context-aware edit actions and content creation shortcuts.
 */
'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/security/rbac'

/**
 * Props for AdminQuickMenu component
 */
interface AdminQuickMenuProps {
  /** Current user's role for permission checks */
  userRole?: UserRole | null
}

// Permission check functions (client-side versions)
function canEdit(role: UserRole | undefined | null): boolean {
  return role === 'admin' || role === 'editor'
}

function canAdmin(role: UserRole | undefined | null): boolean {
  return role === 'admin'
}

// Item type icons and colors
const TYPE_CONFIG = {
  skill: { icon: '⚡', label: 'Skill', color: 'text-cyan-400' },
  agent: { icon: '◈', label: 'Agent', color: 'text-purple-400' },
  command: { icon: '▸', label: 'Command', color: 'text-rose-400' },
  guide: { icon: '📚', label: 'Guide', color: 'text-emerald-400' },
  hook: { icon: '🪝', label: 'Hook', color: 'text-yellow-400' },
} as const

type ItemType = keyof typeof TYPE_CONFIG

/**
 * Admin Quick Access Menu component
 * Displays a dropdown menu with quick access to admin functions
 * Only visible to users with 'editor' or 'admin' role
 */
export function AdminQuickMenu({ userRole }: AdminQuickMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // Only show for users who can edit (editor or admin)
  if (!canEdit(userRole)) {
    return null
  }

  // Parse current page context for contextual actions
  const getContextualAction = (): { type: ItemType; id: string } | null => {
    // Match detail pages: /skill/[id], /agent/[id], /command/[id], /guides/[slug]
    const detailMatch = pathname.match(/^\/(skill|agent|command|hook)\/([^/]+)$/)
    if (detailMatch) {
      return { type: detailMatch[1] as ItemType, id: detailMatch[2] }
    }

    const guideMatch = pathname.match(/^\/guides\/([^/]+)$/)
    if (guideMatch) {
      return { type: 'guide', id: guideMatch[1] }
    }

    return null
  }

  const contextualAction = getContextualAction()

  // Quick create actions
  const createActions: { type: ItemType; href: string }[] = [
    { type: 'skill', href: '/admin/catalog/new?type=skill' },
    { type: 'agent', href: '/admin/catalog/new?type=agent' },
    { type: 'command', href: '/admin/catalog/new?type=command' },
    { type: 'guide', href: '/admin/catalog/new?type=guide' },
    { type: 'hook', href: '/admin/catalog/new?type=hook' },
  ]

  // Management links
  const managementLinks = [
    { icon: '📦', label: '카탈로그 관리', href: '/admin/catalog', requireAdmin: false },
    { icon: '🏷️', label: '태그 관리', href: '/admin/tags', requireAdmin: false },
    { icon: '🔌', label: 'MCP 서버', href: '/admin/mcp-servers', requireAdmin: false },
    { icon: '👥', label: '사용자 관리', href: '/admin/users', requireAdmin: true },
  ]

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${isOpen
            ? 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]'
            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Admin 메뉴"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span>Admin</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          role="menu"
        >
          {/* Context-aware Edit Action */}
          {contextualAction && (
            <>
              <div className="px-3 py-2 bg-[var(--bg-tertiary)]">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  현재 페이지
                </p>
              </div>
              <div className="p-2">
                <Link
                  href={`/admin/catalog/${contextualAction.id}/edit?returnUrl=${encodeURIComponent(pathname)}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group"
                  role="menuitem"
                >
                  <span className="text-lg">✏️</span>
                  <div className="flex-1">
                    <p className="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] transition-colors">
                      편집하기
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {TYPE_CONFIG[contextualAction.type].label} 수정
                    </p>
                  </div>
                  <span className={`text-sm ${TYPE_CONFIG[contextualAction.type].color}`}>
                    {TYPE_CONFIG[contextualAction.type].icon}
                  </span>
                </Link>
              </div>
              <div className="border-t border-[var(--border-subtle)]" />
            </>
          )}

          {/* Quick Create Section */}
          <div className="px-3 py-2 bg-[var(--bg-tertiary)]">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              새로 만들기
            </p>
          </div>
          <div className="p-2 grid grid-cols-2 gap-1">
            {createActions.map(({ type, href }) => (
              <Link
                key={type}
                href={href}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group"
                role="menuitem"
              >
                <span className={`text-sm ${TYPE_CONFIG[type].color}`}>
                  {TYPE_CONFIG[type].icon}
                </span>
                <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {TYPE_CONFIG[type].label}
                </span>
              </Link>
            ))}
          </div>

          {/* Management Section */}
          <div className="border-t border-[var(--border-subtle)]">
            <div className="px-3 py-2 bg-[var(--bg-tertiary)]">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                관리
              </p>
            </div>
            <div className="p-2 space-y-0.5">
              {managementLinks
                .filter(link => !link.requireAdmin || canAdmin(userRole))
                .map(({ icon, label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group"
                    role="menuitem"
                  >
                    <span className="text-base">{icon}</span>
                    <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                      {label}
                    </span>
                  </Link>
                ))}
            </div>
          </div>

          {/* Dashboard Link */}
          <div className="border-t border-[var(--border-subtle)] p-2">
            <Link
              href="/admin"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors font-medium text-sm"
              role="menuitem"
            >
              <span>📊</span>
              <span>대시보드 열기</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
