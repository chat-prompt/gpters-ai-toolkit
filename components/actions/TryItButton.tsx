'use client'

import Link from 'next/link'

interface TryItButtonProps {
  itemId: string
  className?: string
}

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
