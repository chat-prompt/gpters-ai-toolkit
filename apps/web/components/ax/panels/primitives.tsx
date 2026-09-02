'use client'

/**
 * AX 대시보드 — 패널 공통 프리미티브
 *
 * 요약·스킬 구성원 사용 화면이 쓰는 시각 어휘를 나머지 패널이 그대로 쓰게 하는 조각들이다.
 * 섹션은 테두리 카드 대신 모노 라벨 한 줄과 여백으로 나누고, 수치는 칸막이 타일이 아니라
 * 열린 격자에 둔다. 새 패널을 만들거나 고칠 때는 여기 있는 조각부터 쓴다.
 */

import type { ReactNode } from 'react'
import { formatCount } from '../format'

/** 섹션 라벨 — 표 머리칸과 같은 모노 대문자 소형 텍스트 */
export const SECTION_LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]'

/** 라벨 옆·아래에 붙는 보조 수치 한 줄 */
export const META_LINE = 'font-mono text-[11px] tabular-nums text-[var(--text-muted)]'

/** 표 머리칸 — 정렬(text-left/right)은 호출부가 붙인다 */
export const TH = 'px-3 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-[var(--text-muted)]'

/** 표 본문칸 여백 */
export const TD = 'px-3 py-2.5'

/** 데이터가 비었을 때의 조용한 안내문 */
export const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

/**
 * 섹션 머리 — 모노 라벨 한 줄, 오른쪽에 짧은 보조 문구, 필요하면 아래에 설명 한 문장
 */
export function SectionHeader({
  label,
  aside,
  description,
  id,
}: {
  /** 섹션 이름. 표 머리칸과 같은 스타일로 찍힌다 */
  label: string
  /** 오른쪽 끝의 짧은 보조 문구 (범위·기준·상위 N개 등) */
  aside?: string
  /** 라벨 아래 설명 한두 문장 */
  description?: ReactNode
  /** aria-labelledby로 연결할 때 쓰는 id */
  id?: string
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 id={id} className={SECTION_LABEL}>{label}</h3>
        {aside && <p className={META_LINE}>{aside}</p>}
      </div>
      {description && (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
  )
}

const STAT_COLUMNS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

/** 수치 여러 개를 칸막이 없이 나란히 두는 격자 */
export function StatGrid({
  columns = 4,
  children,
}: {
  columns?: keyof typeof STAT_COLUMNS
  children: ReactNode
}) {
  return (
    <div className={`grid grid-cols-1 gap-x-8 gap-y-5 ${STAT_COLUMNS[columns]}`}>{children}</div>
  )
}

/**
 * 수치 한 칸 — 라벨, 큰 모노 숫자, 보조 문구. 설명이 있으면 `?`로 접어 둔다.
 * 값은 `<p>`에 두어 테스트가 selector로 잡을 수 있게 한다.
 */
export function Stat({
  label,
  value,
  unit,
  note,
  help,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  note?: ReactNode
  /** `?`를 눌렀을 때 펼쳐지는 설명 */
  help?: string
  /** warning이면 값을 주황으로 강조 */
  tone?: 'default' | 'warning'
}) {
  return (
    <div className="relative min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
        {help && <StatHelp label={label} explanation={help} />}
      </div>
      <p className={`mt-2 min-w-0 break-words font-mono text-xl tabular-nums ${tone === 'warning' ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'}`}>
        {value}
        {unit && <span className="ml-1 text-xs text-[var(--text-muted)]">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{note}</p>}
    </div>
  )
}

/** 수치 옆 `?` — 누르면 칸 폭 안에 설명을 띄운다. 칸 폭 안에 두어 격자 양 끝에서도 잘리지 않는다. */
function StatHelp({ label, explanation }: { label: string; explanation: string }) {
  return (
    <details className="group">
      {/* 히트 영역은 24px, 보이는 원은 16px. 포커스 링은 다른 컨트롤과 같은 브랜드색 */}
      <summary
        className="-my-1 flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-primary)] [&::-webkit-details-marker]:hidden"
        aria-label={`${label} 설명`}
      >
        <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border-hover)] font-mono text-[9px] text-[var(--text-muted)]">?</span>
      </summary>
      <p className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 text-xs leading-relaxed text-[var(--text-secondary)] shadow-lg">
        {explanation}
      </p>
    </details>
  )
}

/** 비어 있을 때의 안내문 */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={`mt-3 ${EMPTY_NOTE}`}>{children}</p>
}

/**
 * 제목·설명 쌍의 목록 — 인사이트, 점검 항목, 반복 사유처럼 짧은 제목과 한 줄 설명이 이어질 때
 */
export function DefinitionRows({
  rows,
}: {
  rows: Array<{ title: string; detail: ReactNode; warning?: boolean; badge?: string }>
}) {
  return (
    <div className="mt-3 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
      {rows.map((row, index) => (
        <div key={`${row.title}-${index}`} className="grid gap-1 py-3.5 md:grid-cols-[11rem_1fr] md:gap-6">
          <div className="flex items-start justify-between gap-2 md:block">
            <p className={`text-sm ${row.warning ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'}`}>{row.title}</p>
            {row.badge && <span className="md:mt-1 md:block font-mono text-[10px] text-[var(--text-muted)]">{row.badge}</span>}
          </div>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{row.detail}</p>
        </div>
      ))}
    </div>
  )
}

/** 수치 칸 — 0은 눌러서 0이 아닌 값이 먼저 읽히게 한다 */
export function NumberCell({
  value,
  emphasize = false,
  suffix = '',
}: {
  value: number
  emphasize?: boolean
  suffix?: string
}) {
  return (
    <td className={`${TD} text-right font-mono tabular-nums ${
      emphasize
        ? 'text-[var(--accent-orange)]'
        : value === 0
          ? 'text-[var(--text-muted)]'
          : 'text-[var(--text-secondary)]'
    }`}>
      {formatCount(value)}{suffix}
    </td>
  )
}
