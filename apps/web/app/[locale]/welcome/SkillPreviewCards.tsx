'use client'

/**
 * 인기 스킬 카드 목록 + 모달 프리뷰
 *
 * 카드 클릭 시 페이지 이동 대신 모달로 스킬 설명을 보여준다.
 */

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'

/** 스킬 데이터 */
interface Skill {
  /** 스킬 이름 */
  name: string
  /** 스킬 slug ID */
  id: string
  /** 스킬 설명 */
  description: string
  /** 아이콘 — 비워 두면 자리를 잡지 않는다 */
  icon?: string
}

/** SkillPreviewCards props */
interface SkillPreviewCardsProps {
  /** 표시할 스킬 목록 */
  skills: readonly Skill[]
  /** "전체 보기" 링크 텍스트 */
  viewAllLabel: string
}

/**
 * 인기 스킬 카드 그리드 + 클릭 시 모달 프리뷰
 */
export function SkillPreviewCards({ skills, viewAllLabel }: SkillPreviewCardsProps) {
  const [selected, setSelected] = useState<Skill | null>(null)

  const close = useCallback(() => setSelected(null), [])

  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selected, close])

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            onClick={() => setSelected(skill)}
            className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6 hover:border-[var(--brand-primary)]/30 transition-colors text-left cursor-pointer"
          >
            {skill.icon && <div className="text-2xl mb-3">{skill.icon}</div>}
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--brand-primary)] transition-colors">
              {skill.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {skill.description}
            </p>
          </button>
        ))}
      </div>
      <div className="text-center mt-8">
        <Link
          href="/"
          className="text-sm text-[var(--brand-primary)] hover:underline font-medium"
        >
          {viewAllLabel}
        </Link>
      </div>

      {/* Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
            {selected.icon && <div className="text-4xl mb-4">{selected.icon}</div>}
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
              {selected.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
              {selected.description}
            </p>
            <Link
              href={`/skill/${selected.id}`}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] text-white hover:opacity-90 transition-opacity"
            >
              자세히 보기
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
