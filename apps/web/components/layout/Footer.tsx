/**
 * Common footer component
 *
 * Shared footer with privacy policy link, extracted from inline footer patterns.
 */
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'

/**
 * Props for the Footer component
 */
interface FooterProps {
  /** Left-side label text (optional, defaults to translated label) */
  label?: string
  /** Additional CSS classes for the footer element */
  className?: string
}

/**
 * Site-wide footer with branding and privacy link
 *
 * @param label - Left-side label (defaults to translated "AI Toolkit Catalog")
 * @param className - Additional CSS classes
 */
export async function Footer({ label, className }: FooterProps) {
  const t = await getTranslations('common.footer')
  const displayLabel = label ?? t('label')

  return (
    <footer className={`relative z-10 border-t border-[var(--border-subtle)] py-8 ${className ?? ''}`}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-[var(--text-muted)]">
          {displayLabel}
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/privacy"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {t('privacyPolicy')}
          </Link>
          <p className="text-xs text-[var(--text-muted)]">
            {t('builtWith')}
          </p>
        </div>
      </div>
    </footer>
  )
}
