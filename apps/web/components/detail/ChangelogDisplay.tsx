/**
 * 변경 이력 카드
 *
 * 이 버전에서 무엇이 바뀌었는지만 보여준다. 버전과 날짜는 자리가 맞아야
 * 눈으로 훑기 쉬워 고정폭으로 둔다.
 */

/**
 * Props for the ChangelogDisplay component
 */
interface ChangelogDisplayProps {
  /** 버전 문자열 */
  version?: string
  /** 변경 내용 */
  changelog?: string
  /** 마지막 갱신 ISO 날짜 */
  updatedAt?: string
}

/**
 * 버전별 변경 이력을 보여준다
 *
 * @param version - 버전 문자열
 * @param changelog - 변경 내용
 * @param updatedAt - 마지막 갱신 ISO 날짜
 *
 * @example
 * ```tsx
 * <ChangelogDisplay version="1.2.0" changelog="Added feature X" updatedAt="2026-01-15T10:00:00Z" />
 * ```
 */
export function ChangelogDisplay({ version, changelog, updatedAt }: ChangelogDisplayProps) {
  if (!changelog && !version) return null

  return (
    <div className="surface-card mb-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
          <span className="font-mono tabular-nums">{version ? `v${version}` : 'Latest'}</span> Changes
        </h2>
        {updatedAt && (
          <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {new Date(updatedAt).toLocaleDateString('ko-KR')}
          </span>
        )}
      </div>

      {changelog ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
          {changelog}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No changelog available for this version.
        </p>
      )}
    </div>
  )
}
