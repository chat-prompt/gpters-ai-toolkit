'use client'

/**
 * AX 대시보드 — 패널 공통 프리미티브
 *
 * 요약·스킬 구성원 사용 화면이 쓰는 시각 어휘를 나머지 패널이 그대로 쓰게 하는 조각들이다.
 * 섹션은 테두리 카드 대신 모노 라벨 한 줄과 여백으로 나누고, 수치는 칸막이 타일이 아니라
 * 열린 격자에 둔다. 새 패널을 만들거나 고칠 때는 여기 있는 조각부터 쓴다.
 */

import { useId, type ReactNode } from 'react'
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
 * 수치 한 칸 — 라벨, 큰 모노 숫자, 짧은 수치 힌트.
 * 설명 문장은 기본 화면에 두지 않고, 칸에 호버하거나 포커스했을 때만 요약 KPI 카드처럼 아래에 띄운다.
 * 값은 `<p>`에 두어 테스트가 selector로 잡을 수 있게 한다.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  description,
  tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  /** 항상 보이는 짧은 수치 보조 문구 (분모·표본·비율 등) */
  hint?: ReactNode
  /** 호버·포커스 때만 보이는 설명 문장 */
  description?: ReactNode
  /** warning이면 값을 주황으로 강조 */
  tone?: 'default' | 'warning'
}) {
  const tooltipId = useId()
  return (
    <div
      className="group relative min-w-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-primary)]"
      tabIndex={description ? 0 : undefined}
      aria-describedby={description ? tooltipId : undefined}
    >
      <p className={`text-xs text-[var(--text-secondary)] ${description ? 'cursor-help' : ''}`}>{label}</p>
      <p className={`mt-2 min-w-0 break-words font-mono text-xl tabular-nums ${tone === 'warning' ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'}`}>
        {value}
        {unit && <span className="ml-1 text-xs text-[var(--text-muted)]">{unit}</span>}
      </p>
      {hint && <p className={`mt-1 ${META_LINE}`}>{hint}</p>}
      {description && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute inset-x-0 top-full z-30 mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-normal leading-relaxed tracking-normal text-[var(--text-secondary)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus:visible group-focus:translate-y-0 group-focus:opacity-100"
          style={{ transform: 'translateY(-2px)' }}
        >
          {description}
        </span>
      )}
    </div>
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

/** 데이터 포인트 툴팁 한 줄 — 왼쪽 이름, 오른쪽 값 */
export interface TipRow {
  label: string
  value: string
}

/**
 * 데이터 포인트 툴팁 상자 클래스.
 * 위치 규칙은 한 가지다: 가리킨 포인트 **위**, 가로 가운데, 차트 컨테이너 안으로 클램프.
 */
export const TIP_BOX = 'pointer-events-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-2 text-left font-mono text-[11px] tabular-nums text-[var(--text-primary)] shadow-lg'

/**
 * 데이터 포인트 툴팁 본문 — 제목(날짜·시각) 한 줄 아래 항목을 세로로 쌓는다.
 * 가로로 길게 잇지 않으므로 줄바꿈이 생기지 않는다.
 */
export function TipContent({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <>
      <p className="whitespace-nowrap text-[var(--text-muted)]">{title}</p>
      {rows.length > 0 && (
        <dl className="mt-1 space-y-0.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 whitespace-nowrap">
              <dt className="text-[var(--text-secondary)]">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

/** 툴팁과 같은 내용을 접근성 이름용 한 줄 문자열로 */
export function tipText(title: string, rows: TipRow[]): string {
  return [title, ...rows.map((row) => `${row.label} ${row.value}`)].join(' · ')
}
