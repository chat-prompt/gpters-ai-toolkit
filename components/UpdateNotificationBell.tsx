'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PluginUpdate, UpdateCheckResult } from '@/lib/plugin-updates'

interface UpdateNotificationBellProps {
  /** Initial updates to display (from server-side fetch) */
  initialUpdates?: PluginUpdate[]
  /** Whether to auto-check for updates on mount */
  autoCheck?: boolean
  /** Interval in ms to check for updates (default: 5 minutes) */
  checkInterval?: number
}

const STORAGE_KEY = 'plugin-updates-dismissed'
const REMIND_LATER_KEY = 'plugin-updates-remind-later'
const REMIND_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export function UpdateNotificationBell({
  initialUpdates = [],
  autoCheck = true,
  checkInterval = 5 * 60 * 1000,
}: UpdateNotificationBellProps) {
  const [updates, setUpdates] = useState<PluginUpdate[]>(initialUpdates)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter out dismissed and "remind later" updates
  const visibleUpdates = updates.filter((update) => {
    if (typeof window === 'undefined') return true

    // Check if dismissed
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) {
      const dismissedIds = JSON.parse(dismissed) as Record<string, string>
      // Dismissed for this specific version
      if (dismissedIds[update.id] === update.latestVersion) {
        return false
      }
    }

    // Check if "remind later" is still active
    const remindLater = localStorage.getItem(REMIND_LATER_KEY)
    if (remindLater) {
      const reminders = JSON.parse(remindLater) as Record<string, number>
      const remindUntil = reminders[update.id]
      if (remindUntil && Date.now() < remindUntil) {
        return false
      }
    }

    return true
  })

  const updateCount = visibleUpdates.length

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Check for updates
  const checkForUpdates = useCallback(async () => {
    if (typeof window === 'undefined') return

    setIsLoading(true)
    try {
      // Get installed plugins from localStorage (or other source)
      const installedRaw = localStorage.getItem('installed-plugins')
      const installed = installedRaw ? JSON.parse(installedRaw) : []

      if (installed.length === 0) {
        setUpdates([])
        setLastChecked(new Date().toISOString())
        return
      }

      const response = await fetch('/api/updates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugins: installed }),
      })

      if (response.ok) {
        const result: UpdateCheckResult = await response.json()
        setUpdates(result.updates)
        setLastChecked(result.checkedAt)
      }
    } catch (error) {
      console.error('Failed to check for updates:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Auto-check for updates on mount and at interval
  useEffect(() => {
    if (!autoCheck) return

    // Initial check
    checkForUpdates()

    // Set up interval
    const interval = setInterval(checkForUpdates, checkInterval)
    return () => clearInterval(interval)
  }, [autoCheck, checkInterval, checkForUpdates])

  // Handle dismiss
  const handleDismiss = (update: PluginUpdate) => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    const dismissedIds = dismissed ? JSON.parse(dismissed) : {}
    dismissedIds[update.id] = update.latestVersion
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissedIds))

    // Force re-render
    setUpdates([...updates])
  }

  // Handle remind later
  const handleRemindLater = (update: PluginUpdate) => {
    const remindLater = localStorage.getItem(REMIND_LATER_KEY)
    const reminders = remindLater ? JSON.parse(remindLater) : {}
    reminders[update.id] = Date.now() + REMIND_DURATION
    localStorage.setItem(REMIND_LATER_KEY, JSON.stringify(reminders))

    // Force re-render
    setUpdates([...updates])
  }

  // Don't render if no updates
  if (updateCount === 0 && !isLoading) {
    return null
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        aria-label={`${updateCount} updates available`}
      >
        {/* Bell icon */}
        <svg
          className={`w-5 h-5 ${updateCount > 0 ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)]'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Badge */}
        {updateCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold rounded-full bg-[var(--accent-cyan)] text-black">
            {updateCount > 99 ? '99+' : updateCount}
          </span>
        )}

        {/* Loading spinner */}
        {isLoading && (
          <span className="absolute -top-1 -right-1 w-4 h-4 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-xl z-[1001] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          {/* Header */}
          <div className="sticky top-0 bg-[var(--bg-secondary)] px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--text-primary)]">
                Updates Available
              </h3>
              <button
                onClick={checkForUpdates}
                disabled={isLoading}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors"
                title="Refresh"
              >
                <svg
                  className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            {lastChecked && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Last checked:{' '}
                {new Date(lastChecked).toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Update list */}
          {visibleUpdates.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--text-muted)]">
              <svg
                className="w-12 h-12 mx-auto mb-3 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p>All plugins are up to date!</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {visibleUpdates.map((update) => (
                <UpdateItem
                  key={update.id}
                  update={update}
                  onDismiss={() => handleDismiss(update)}
                  onRemindLater={() => handleRemindLater(update)}
                  onNavigate={() => setIsOpen(false)}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          {visibleUpdates.length > 0 && (
            <div className="sticky bottom-0 bg-[var(--bg-secondary)] px-4 py-3 border-t border-[var(--border-subtle)]">
              <Link
                href="/profile?tab=updates"
                className="block w-full py-2 text-center text-sm font-medium rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors"
                onClick={() => setIsOpen(false)}
              >
                View all updates
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Individual update item in the dropdown
 */
interface UpdateItemProps {
  update: PluginUpdate
  onDismiss: () => void
  onRemindLater: () => void
  onNavigate: () => void
}

function UpdateItem({
  update,
  onDismiss,
  onRemindLater,
  onNavigate,
}: UpdateItemProps) {
  const typeStyles = {
    major: 'bg-red-500/20 text-red-400',
    minor: 'bg-yellow-500/20 text-yellow-400',
    patch: 'bg-green-500/20 text-green-400',
  }

  const typeLabels = {
    major: 'Major',
    minor: 'Minor',
    patch: 'Patch',
  }

  const detailPath = `/${update.type}/${update.id}`

  return (
    <div className="px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors group">
      <div className="flex items-start gap-3">
        {/* Type indicator */}
        <span
          className={`flex-shrink-0 mt-0.5 px-1.5 py-0.5 text-xs font-medium rounded ${typeStyles[update.updateType]}`}
        >
          {typeLabels[update.updateType]}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Link
            href={detailPath}
            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-cyan)] transition-colors line-clamp-1"
            onClick={onNavigate}
          >
            {update.name}
          </Link>

          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[var(--text-muted)]">
            <span className="font-mono">{update.currentVersion}</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-mono text-[var(--text-secondary)]">
              {update.latestVersion}
            </span>
          </div>

          {update.changelog && (
            <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
              {update.changelog.split('\n')[0]}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.preventDefault()
              onRemindLater()
            }}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            title="Remind me later"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.preventDefault()
              onDismiss()
            }}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
