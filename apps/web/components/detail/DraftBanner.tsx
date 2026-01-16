/**
 * Draft status banner component
 *
 * Displays warning banner for draft items indicating
 * they are not visible in the public catalog.
 */

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
export function DraftBanner({ className = '' }: DraftBannerProps) {
  return (
    <div
      className={`rounded-xl p-4 mb-8 bg-yellow-500/10 border border-yellow-500/30 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">🚧</span>
        <div>
          <div className="text-sm font-medium text-yellow-400">Draft</div>
          <p className="text-xs text-yellow-400/70 mt-0.5">
            이 아이템은 아직 작성 중이며 공개 카탈로그에 표시되지 않습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
