/**
 * 카탈로그 구획 머리글
 *
 * 제목과 개수만 두고 아래에 실선을 그어 목록의 시작을 알린다.
 */
import { memo } from 'react'
import type { SectionHeaderProps } from './types'

/**
 * 구획 머리글
 *
 * @param title - 구획 제목
 * @param count - 구획에 속한 항목 수
 *
 * @example
 * ```tsx
 * <SectionHeader title="Skills" count={42} />
 * ```
 */
export const SectionHeader = memo(function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-baseline gap-3 border-b border-[var(--border-subtle)] pb-3">
      <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">{title}</h2>
      <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{count}</span>
    </div>
  )
})
