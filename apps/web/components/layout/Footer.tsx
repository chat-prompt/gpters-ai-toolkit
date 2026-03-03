/**
 * Common footer component
 *
 * Shared footer with privacy policy link, extracted from inline footer patterns.
 */
import Link from 'next/link'

/**
 * Props for the Footer component
 */
interface FooterProps {
  /** Left-side label text */
  label?: string
  /** Additional CSS classes for the footer element */
  className?: string
}

/**
 * Site-wide footer with branding and privacy link
 *
 * @param label - Left-side label (defaults to "AI Toolkit Catalog")
 * @param className - Additional CSS classes
 */
export function Footer({ label = 'AI Toolkit Catalog', className }: FooterProps) {
  return (
    <footer className={`relative z-10 border-t border-[var(--border-subtle)] py-8 ${className ?? ''}`}>
      <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {label}
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/privacy"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Privacy Policy
          </Link>
          <p className="text-xs text-[var(--text-muted)]">
            Built with Claude Code
          </p>
        </div>
      </div>
    </footer>
  )
}
