/**
 * Fork button component for copying catalog items to current organization
 *
 * Displays a fork button that allows users to create a copy of an item
 * from another organization into their current organization.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Props for the ForkButton component
 */
interface ForkButtonProps {
  /** Unique item identifier to fork */
  itemId: string
  /** Additional CSS classes */
  className?: string
}

/**
 * Button for forking catalog items across organizations
 *
 * Creates a draft copy of the item in the user's current organization
 * when clicked. Shows loading state during the fork operation and
 * provides feedback on success or error.
 *
 * @example
 * ```tsx
 * <ForkButton itemId="abc-123" />
 * ```
 */
export function ForkButton({ itemId, className = '' }: ForkButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleFork = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch(`/api/catalog/${itemId}/fork`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fork item')
      }

      const forkedItem = await response.json()
      setSuccess(true)

      // Redirect to the forked item after a brief delay
      setTimeout(() => {
        router.push(`/${forkedItem.type}/${forkedItem.id}`)
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fork item')
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm ${className}`}>
        <span>✓</span>
        <span>Forked! Redirecting...</span>
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        onClick={handleFork}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30 hover:bg-[var(--accent-cyan)]/20 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {isLoading ? (
          <>
            <span className="animate-spin">⟳</span>
            <span>Forking...</span>
          </>
        ) : (
          <>
            <span>🔱</span>
            <span>Fork to My Org</span>
          </>
        )}
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  )
}
