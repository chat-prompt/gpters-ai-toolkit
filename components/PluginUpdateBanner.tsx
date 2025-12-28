'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PluginUpdate } from '@/lib/plugin/updates'

interface PluginUpdateBannerProps {
  update: PluginUpdate
  onDismiss?: () => void
  onRemindLater?: () => void
}

const UPDATE_TYPE_STYLES = {
  major: {
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: '!',
    border: 'border-red-500/30',
  },
  minor: {
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: '+',
    border: 'border-yellow-500/30',
  },
  patch: {
    badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: '^',
    border: 'border-green-500/30',
  },
}

const UPDATE_TYPE_LABELS = {
  major: 'Major Update',
  minor: 'Minor Update',
  patch: 'Patch',
}

export function PluginUpdateBanner({
  update,
  onDismiss,
  onRemindLater,
}: PluginUpdateBannerProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const styles = UPDATE_TYPE_STYLES[update.updateType]
  const typeLabel = UPDATE_TYPE_LABELS[update.updateType]

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss?.()
  }

  const handleRemindLater = () => {
    setIsVisible(false)
    onRemindLater?.()
  }

  if (!isVisible) return null

  const detailPath = `/${update.type}/${update.id}`

  return (
    <div
      className={`rounded-xl border ${styles.border} bg-[var(--bg-secondary)] p-4 transition-all`}
    >
      <div className="flex items-start gap-4">
        {/* Update type indicator */}
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${styles.badge} font-bold text-lg`}
        >
          {styles.icon}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-[var(--text-primary)]">
              {update.name}
            </h4>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${styles.badge}`}
            >
              {typeLabel}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span className="font-mono">{update.currentVersion}</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
            <span className="font-mono text-[var(--text-primary)]">
              {update.latestVersion}
            </span>
          </div>

          {/* Changelog preview */}
          {update.changelog && (
            <div className="mt-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-sm text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]/80 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                {isExpanded ? 'Hide changelog' : 'View changelog'}
              </button>

              {isExpanded && (
                <div className="mt-2 p-3 rounded-lg bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] max-h-40 overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-sans">
                    {update.changelog}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <Link
            href={detailPath}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent-cyan)] text-black hover:opacity-90 transition-opacity"
          >
            Update
          </Link>

          {onRemindLater && (
            <button
              onClick={handleRemindLater}
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Remind me later"
            >
              Later
            </button>
          )}

          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Dismiss"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Container component that shows multiple update banners stacked
 */
interface PluginUpdateBannerListProps {
  updates: PluginUpdate[]
  onDismiss?: (updateId: string) => void
  onRemindLater?: (updateId: string) => void
  maxVisible?: number
}

export function PluginUpdateBannerList({
  updates,
  onDismiss,
  onRemindLater,
  maxVisible = 3,
}: PluginUpdateBannerListProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const visibleUpdates = updates.filter((u) => !dismissedIds.has(u.id))
  const displayUpdates = showAll
    ? visibleUpdates
    : visibleUpdates.slice(0, maxVisible)
  const hiddenCount = visibleUpdates.length - displayUpdates.length

  const handleDismiss = (updateId: string) => {
    setDismissedIds((prev) => new Set(prev).add(updateId))
    onDismiss?.(updateId)
  }

  if (visibleUpdates.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          Updates Available ({visibleUpdates.length})
        </h3>
        {hiddenCount > 0 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="text-sm text-[var(--accent-cyan)] hover:underline"
          >
            Show all
          </button>
        )}
        {showAll && visibleUpdates.length > maxVisible && (
          <button
            onClick={() => setShowAll(false)}
            className="text-sm text-[var(--accent-cyan)] hover:underline"
          >
            Show less
          </button>
        )}
      </div>

      {displayUpdates.map((update) => (
        <PluginUpdateBanner
          key={update.id}
          update={update}
          onDismiss={() => handleDismiss(update.id)}
          onRemindLater={() => {
            handleDismiss(update.id)
            onRemindLater?.(update.id)
          }}
        />
      ))}

      {hiddenCount > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          +{hiddenCount} more updates
        </button>
      )}
    </div>
  )
}
