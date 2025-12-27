'use client'

import { useState, useRef, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/lib/rbac'

interface UserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: UserRole
  }
}

// Check if user has admin access (viewer, editor, or admin can access admin panel)
function hasAdminAccess(role?: UserRole): boolean {
  return role === 'admin' || role === 'editor' || role === 'viewer'
}

export function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: ⌘+Shift+A (or Ctrl+Shift+A on Windows/Linux) for Admin
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        if (hasAdminAccess(user.role)) {
          event.preventDefault()
          router.push('/admin')
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [user.role, router])

  const showAdminLink = hasAdminAccess(user.role)

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={24}
            height={24}
            className="w-6 h-6 rounded-full"
            unoptimized
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)] flex items-center justify-center text-black text-xs font-medium">
            {user.name?.[0] || user.email?.[0] || '?'}
          </div>
        )}
        <span className="text-sm text-[var(--text-primary)] max-w-[100px] truncate hidden sm:block">
          {user.name || user.email?.split('@')[0]}
        </span>
        {/* Admin badge */}
        {user.role === 'admin' && (
          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30">
            Admin
          </span>
        )}
        <svg
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl overflow-hidden shadow-xl z-[1001] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {user.name}
            </p>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {user.email}
            </p>
            {user.role && (
              <span className={`inline-flex items-center px-1.5 py-0.5 mt-1 rounded text-[10px] font-medium ${
                user.role === 'admin'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : user.role === 'editor'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {user.role === 'admin' ? 'Admin' : user.role === 'editor' ? 'Editor' : 'Viewer'}
              </span>
            )}
          </div>
          <div className="py-1">
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              프로필
            </Link>
            {showAdminLink && (
              <>
                <div className="border-t border-[var(--border-subtle)] my-1" />
                <Link
                  href="/admin"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Admin
                  <span className="ml-auto text-xs text-[var(--text-muted)]">⌘⇧A</span>
                </Link>
              </>
            )}
            <div className="border-t border-[var(--border-subtle)] my-1" />
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="w-full px-4 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
