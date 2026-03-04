/**
 * Draft status banner component
 *
 * Displays warning banner for draft items indicating
 * they are not visible in the public catalog.
 */
import { getTranslations } from 'next-intl/server'

/**
 * Props for the DraftBanner component
 */
interface DraftBannerProps {
  /** Additional CSS classes */
  className?: string
}

/**
 * Yellow warning banner for draft status items
 *
 * @example
 * ```tsx
 * {item.status === 'draft' && <DraftBanner />}
 * ```
 */
export async function DraftBanner({ className = '' }: DraftBannerProps) {
  const t = await getTranslations('detail')

  return (
    <div
      className={`rounded-xl p-4 mb-8 bg-yellow-500/10 border border-yellow-500/30 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">🚧</span>
        <div>
          <div className="text-sm font-medium text-yellow-400">Draft</div>
          <p className="text-xs text-yellow-400/70 mt-0.5">
            {t('draft.description')}
          </p>
        </div>
      </div>
    </div>
  )
}
