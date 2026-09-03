'use client'

/**
 * 좁은 화면에서 헤더 탭을 접어 두는 펼침 메뉴
 *
 * 헤더의 탭은 다섯 개까지 늘어나므로 `lg` 미만에서 가로로 펼치면 오른쪽 액션 아이콘과 자리를 다툰다.
 * 이 메뉴는 같은 탭 목록을 버튼 하나 뒤에 감춰 두고 현재 위치를 함께 알린다.
 *
 * 항목이 모두 링크이므로 메뉴(role="menu")가 아니라 펼침 영역으로 만든다. 그래야 보조 기술이
 * "링크 5개 목록"으로 읽어 주고, 방향키 이동 같은 메뉴 규약을 약속하지 않는다.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'

/**
 * 헤더가 보여주는 탭 하나
 */
export interface HeaderNavItem {
  /** 이동할 경로 */
  href: string
  /** 화면에 보이는 이름 */
  label: string
  /** 지금 이 탭의 화면을 보고 있는지 */
  active: boolean
}

/**
 * HeaderNavMenu 속성
 */
interface HeaderNavMenuProps {
  /** 메뉴에 넣을 탭 목록. 데스크톱 탭과 같은 목록을 넘긴다 */
  items: HeaderNavItem[]
  /** 버튼의 접근성 이름 (예: "메뉴") */
  label: string
}

/**
 * 접이식 헤더 탭 메뉴
 *
 * 바깥 클릭, Escape, 포커스 이탈로 닫히고 탭을 고르면 스스로 닫힌다. Escape로 닫으면 버튼으로 포커스를
 * 돌려준다. `lg` 이상에서는 렌더링되지 않는다.
 *
 * @param items - 표시할 탭 목록
 * @param label - 버튼의 접근성 이름
 */
export function HeaderNavMenu({ items, label }: HeaderNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const activeItem = items.find((item) => item.active)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      // 닫은 자리에 포커스를 두고 가면 키보드 사용자가 문서 처음으로 떨어진다
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div
      className="relative lg:hidden"
      ref={menuRef}
      // 마지막 항목에서 Tab으로 빠져나가면 펼친 채 남지 않게 닫는다
      onBlur={(event) => {
        if (!menuRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false)
      }}
    >
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={activeItem ? `${label}: ${activeItem.label}` : label}
        className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center gap-2 rounded-full px-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:justify-start"
      >
        <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {/* 현재 위치는 폭이 허락할 때만 적는다. 가장 좁은 화면에서는 아이콘만 남고 이름은 버튼 라벨이 알린다 */}
        {activeItem && (
          <span aria-hidden className="hidden max-w-[10rem] truncate font-medium text-[var(--text-primary)] sm:inline">
            {activeItem.label}
          </span>
        )}
      </button>

      {isOpen && (
        <nav
          id={panelId}
          aria-label={label}
          className="absolute left-0 z-[1001] mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] py-1 shadow-xl"
        >
          <ul>
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={() => setIsOpen(false)}
                  className={`block touch-manipulation px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] ${
                    item.active
                      ? 'bg-[var(--bg-tertiary)] font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
