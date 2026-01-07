/**
 * Try it button component for playground navigation
 *
 * Renders a styled link button that navigates to the
 * playground page for a specific catalog item.
 */
'use client'

import Link from 'next/link'

/** Props for TryItButton component */
interface TryItButtonProps {
  /** Catalog item ID to navigate to in playground */
  itemId: string
  /** Additional CSS classes */
  className?: string
}

/**
 * Playground navigation button
 *
 * Styled button that links to the interactive playground
 * where users can try out a catalog item.
 */
export function TryItButton({ itemId, className = '' }: TryItButtonProps) {
  return (
    <Link
      href={`/playground/${itemId}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        bg-[var(--accent-cyan)] text-[var(--bg-primary)]
        hover:opacity-90 transition-opacity ${className}`}
    >
      <span className="text-sm">▸</span>
      <span>Try it</span>
    </Link>
  )
}
