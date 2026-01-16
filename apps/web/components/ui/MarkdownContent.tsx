/**
 * Lazy-loaded Markdown content wrapper with skeleton loading
 *
 * This module provides a lightweight wrapper that dynamically imports the heavy
 * markdown rendering libraries (react-markdown, remark-gfm, rehype-sanitize)
 * to reduce initial bundle size.
 */
'use client'

import dynamic from 'next/dynamic'
import { memo } from 'react'

// ============================================================================
// Types
// ============================================================================

/**
 * Props for the MarkdownContent component
 */
interface MarkdownContentProps {
  /** Raw markdown string to render */
  content: string
  /** Additional CSS classes for the wrapper */
  className?: string
}

// ============================================================================
// Skeleton Loader
// ============================================================================

/**
 * Loading skeleton shown while markdown libraries are being loaded
 *
 * Displays a placeholder UI that mimics typical markdown content structure.
 */
function MarkdownSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Title skeleton */}
      <div className="h-6 bg-[var(--bg-tertiary)] rounded-lg w-3/4" />

      {/* Paragraph skeletons */}
      <div className="space-y-2">
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-full" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-5/6" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-4/5" />
      </div>

      {/* Subheading skeleton */}
      <div className="h-5 bg-[var(--bg-tertiary)] rounded-lg w-1/2 mt-6" />

      {/* More paragraph skeletons */}
      <div className="space-y-2">
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-full" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-11/12" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-3/4" />
      </div>

      {/* Code block skeleton */}
      <div className="h-24 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)]" />

      {/* List skeleton */}
      <div className="space-y-2 pl-4">
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-2/3" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-3/4" />
        <div className="h-4 bg-[var(--bg-tertiary)] rounded w-1/2" />
      </div>
    </div>
  )
}

// ============================================================================
// Dynamic Import
// ============================================================================

// Dynamically import the heavy markdown renderer
const MarkdownRenderer = dynamic(
  () => import('./MarkdownRenderer').then(mod => mod.MarkdownRenderer),
  {
    loading: () => <MarkdownSkeleton />,
    ssr: false, // Disable SSR for client-side only rendering
  }
)

// ============================================================================
// Main Component
// ============================================================================

/**
 * Markdown content renderer with dynamic import for bundle optimization.
 * Uses skeleton loading UI while the markdown libraries are being loaded.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  className = ''
}: MarkdownContentProps) {
  if (!content) {
    return null
  }

  return (
    <div className={className}>
      <MarkdownRenderer content={content} />
    </div>
  )
})

// Re-export skeleton for external use
export { MarkdownSkeleton }
