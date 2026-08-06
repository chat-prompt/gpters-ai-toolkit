'use client'

/**
 * 상세 페이지 목차
 *
 * 넓은 화면에서만 오른쪽에 고정으로 붙어, 스크롤 위치에 맞춰 현재 구획을 짚어 준다.
 * 좁은 화면에서는 본문을 가리지 않도록 아예 감춘다.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'

/**
 * 목차 항목
 */
export interface TocItem {
  /** 이동할 요소 ID */
  id: string
  /** 표시 이름 */
  label: string
}

/**
 * Props for the TableOfContents component
 */
interface TableOfContentsProps {
  /** 목차에 세울 구획 목록 */
  items: TocItem[]
}

/**
 * 지금 스크롤 위치에 해당하는 구획 ID를 구한다
 *
 * @param items - 목차 항목 목록
 * @returns 현재 구획 ID
 */
function getInitialActiveId(items: TocItem[]): string {
  if (typeof window === 'undefined' || items.length === 0) {
    return items[0]?.id || ''
  }

  const scrollPosition = window.scrollY + 120

  for (let i = items.length - 1; i >= 0; i--) {
    const element = document.getElementById(items[i].id)
    if (element && element.offsetTop <= scrollPosition) {
      return items[i].id
    }
  }

  return items[0]?.id || ''
}

/**
 * 스크롤을 따라 현재 구획을 짚어 주는 고정 목차
 *
 * @param items - 목차에 세울 구획 목록
 *
 * @example
 * ```tsx
 * <TableOfContents items={[{ id: 'overview', label: '개요' }]} />
 * ```
 */
export function TableOfContents({ items }: TableOfContentsProps) {
  const t = useTranslations('detail')
  // 첫 항목으로 시작하고, 마운트 뒤 실제 스크롤 위치로 맞춘다
  const initialId = useMemo(() => items[0]?.id || '', [items])
  const [activeId, setActiveId] = useState<string>(initialId)

  const handleScroll = useCallback(() => {
    const scrollPosition = window.scrollY + 120 // 헤더 높이만큼 띄운다

    for (let i = items.length - 1; i >= 0; i--) {
      const element = document.getElementById(items[i].id)
      if (element && element.offsetTop <= scrollPosition) {
        setActiveId(items[i].id)
        return
      }
    }

    if (items.length > 0) {
      setActiveId(items[0].id)
    }
  }, [items])

  useEffect(() => {
    setActiveId(getInitialActiveId(items))
  }, [items])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      })
    }
  }

  if (items.length === 0) return null

  return (
    <nav className="fixed right-8 top-32 z-20 hidden w-48 xl:block">
      <p className="eyebrow">{t('toc.heading')}</p>
      {/* 세로선 하나에 항목을 매달아, 지금 보는 구획만 선이 진해진다 */}
      <ul className="mt-3 border-l border-[var(--border-subtle)]">
        {items.map((item) => {
          const isActive = activeId === item.id
          return (
            <li key={item.id}>
              <button
                onClick={() => scrollToSection(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`-ml-px w-full border-l py-1.5 pl-3 text-left text-[13px] transition-colors ${
                  isActive
                    ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <span className="block truncate">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Props for the Section wrapper component
 */
interface SectionProps {
  /** 목차가 가리킬 요소 ID */
  id: string
  /** 구획 내용 */
  children: React.ReactNode
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 목차 이동 시 헤더에 가리지 않도록 여백을 두는 구획 래퍼
 *
 * @param id - 목차가 가리킬 요소 ID
 * @param children - 구획 내용
 * @param className - 추가 CSS 클래스
 *
 * @example
 * ```tsx
 * <Section id="overview">
 *   <ItemHero {...heroProps} />
 * </Section>
 * ```
 */
export function Section({ id, children, className = '' }: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-24 ${className}`}>
      {children}
    </section>
  )
}
