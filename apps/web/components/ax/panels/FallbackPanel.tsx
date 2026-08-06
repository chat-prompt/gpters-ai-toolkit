/**
 * AX 대시보드 — 범용 폴백 패널 본문
 *
 * 전용 화면이 등록되지 않은 패널을 위한 렌더러.
 * 서버 레지스트리에 패널만 추가해도 화면에 뜨게 만드는 장치다.
 *
 * 임시 화면이므로 표를 세우지 않고 키-값 구분선 목록으로 조용히 보여준다.
 */

import type { AxPanelViewProps } from './types'

/** 데이터가 비었을 때의 조용한 안내문 */
const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

/**
 * 전용 컴포넌트가 없는 패널의 기본 화면
 *
 * 객체는 키-값 목록으로, 그 외에는 정리된 JSON으로 보여준다.
 *
 * @param data - 패널이 내려준 임의의 데이터
 */
export function FallbackPanel({ data }: AxPanelViewProps<unknown>) {
  if (data === null || data === undefined) {
    return <p className={EMPTY_NOTE}>표시할 데이터가 없습니다.</p>
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) {
      return <p className={EMPTY_NOTE}>표시할 데이터가 없습니다.</p>
    }

    return (
      <dl className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-6 py-2.5">
            <dt className="min-w-0 shrink-0 font-mono text-sm text-[var(--text-secondary)]">
              {key}
            </dt>
            <dd className="min-w-0 text-right break-all text-[var(--text-primary)]">
              <ValueCell value={value} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <pre className="overflow-x-auto border-l-2 border-[var(--border-subtle)] pl-4 font-mono text-xs whitespace-pre-wrap text-[var(--text-secondary)]">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

/**
 * 값 한 칸 — 사람이 읽는 말과 기계가 읽는 값의 글꼴을 가른다
 *
 * 객체·배열은 한 줄에 다 들어가지 않으므로 더 작은 모노스페이스로 눌러 둔다.
 *
 * @param value - 임의의 값
 */
function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-[var(--text-muted)]">—</span>
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="font-mono text-sm tabular-nums">{String(value)}</span>
  }

  if (typeof value === 'string') {
    return <span className="text-sm">{value}</span>
  }

  return <span className="font-mono text-xs">{JSON.stringify(value)}</span>
}
