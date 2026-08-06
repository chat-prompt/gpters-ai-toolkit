'use client'

/**
 * AX 대시보드 — 표 페이지네이션
 *
 * 표가 길어지면 한 장씩 끊어 본다. 서버는 전체를 한 번에 내려주므로
 * 페이지 나누기는 화면에서만 한다.
 *
 * 컨트롤은 표 아래 오른쪽에 조용히 붙고, 한 장뿐이면 아예 그리지 않는다.
 */

import { useState } from 'react'

/**
 * 페이지 이동 컨트롤이 받는 값
 *
 * `usePagedRows`가 이 모양 그대로 돌려주므로 펼쳐서 넘기면 된다.
 */
export interface TablePagerProps {
  /** 현재 장 번호 (1부터) */
  page: number
  /** 전체 장 수 (최소 1) */
  pageCount: number
  /** 이 장의 첫 행 번호 (1부터). 행이 없으면 0 */
  from: number
  /** 이 장의 마지막 행 번호 */
  to: number
  /** 전체 행 수 */
  total: number
  /** 장 이동 요청 */
  onChange: (page: number) => void
}

/** 누를 수 없는 버튼 — 선은 남기고 존재감만 죽인다 */
const DISABLED = 'opacity-40 cursor-not-allowed'

/**
 * 페이지 이동 컨트롤
 *
 * @param props - 현재 위치와 장 이동 콜백
 * @returns 컨트롤. 나눌 장이 하나뿐이면 아무것도 그리지 않는다
 */
export function TablePager({ page, pageCount, from, to, total, onChange }: TablePagerProps) {
  if (pageCount <= 1) return null

  const atFirst = page <= 1
  const atLast = page >= pageCount

  return (
    <nav aria-label="페이지 이동" className="flex items-center justify-end gap-3">
      <button
        type="button"
        aria-label="이전 페이지"
        disabled={atFirst}
        onClick={() => onChange(page - 1)}
        className={`pill pill-quiet ${atFirst ? DISABLED : ''}`}
      >
        이전
      </button>
      <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
        {from}–{to} / {total}
      </span>
      <button
        type="button"
        aria-label="다음 페이지"
        disabled={atLast}
        onClick={() => onChange(page + 1)}
        className={`pill pill-quiet ${atLast ? DISABLED : ''}`}
      >
        다음
      </button>
    </nav>
  )
}

/**
 * 목록을 장 단위로 끊어주는 훅
 *
 * 기간을 바꾸면 보고 있던 장이 의미를 잃으므로 첫 장으로 되돌려야 한다.
 * 되돌림은 이 훅이 하지 않는다 — 이 훅을 쓰는 컴포넌트에 `key`를 물려
 * 데이터가 바뀔 때 통째로 다시 태우는 쪽이 상태를 손으로 되돌리는 것보다 단순하다.
 *
 * @param rows - 전체 행
 * @param pageSize - 한 장에 실을 행 수
 * @returns 이 장의 행과 컨트롤에 그대로 넘길 값
 */
export function usePagedRows<T>(
  rows: T[],
  pageSize: number
): { rows: T[]; pager: TablePagerProps } {
  const [page, setPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  // 데이터가 줄어 마지막 장이 사라진 순간에도 빈 화면이 되지 않게 현재 장을 접어 둔다
  const current = Math.min(page, pageCount)
  const start = (current - 1) * pageSize
  const shown = rows.slice(start, start + pageSize)

  return {
    rows: shown,
    pager: {
      page: current,
      pageCount,
      from: shown.length === 0 ? 0 : start + 1,
      to: start + shown.length,
      total: rows.length,
      onChange: setPage,
    },
  }
}
