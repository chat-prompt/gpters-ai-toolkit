/**
 * 작성 중 안내 띠
 *
 * 아직 공개 카탈로그에 뜨지 않는 항목임을 알린다. 경고색으로 화면을 물들이지
 * 않고 왼쪽 세로선 하나로만 표시한다 — 읽을 내용은 아래 본문이지 이 띠가 아니다.
 */
import { getTranslations } from 'next-intl/server'

/**
 * Props for the DraftBanner component
 */
interface DraftBannerProps {
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 작성 중(draft) 항목 안내 띠
 *
 * @param className - 추가 CSS 클래스
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
      className={`mb-8 border-l-2 border-[var(--brand-primary)] bg-[var(--bg-secondary)] py-3 pl-4 pr-4 ${className}`}
    >
      <p className="eyebrow">Draft</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('draft.description')}</p>
    </div>
  )
}
