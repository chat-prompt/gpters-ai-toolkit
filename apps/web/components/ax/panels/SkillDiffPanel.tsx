'use client'

/**
 * AX 대시보드 — 스킬 비교 패널 본문
 *
 * 팀 스킬(aitk)과 에이전트 스킬(bbopters-shared)의 이름·내용 대조 결과를
 * 네 갈래(동일 · 유사 · 다름 · 교차 일치)로 보여준다.
 *
 * 이 화면의 존재 이유: 같은 id라도 내용이 사실상 다른 "동명이인 스킬"이 실재하므로,
 * 두 소스를 자동으로 합치면 안 된다는 사실을 눈으로 확인할 수 있게 한다.
 */

import type { AxSkillDiffData, AxSkillDiffRow } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount } from '../format'

/** 섹션 라벨 공통 스타일 */
const SECTION_LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]'

/** 데이터가 비었을 때의 조용한 안내문 */
const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

/**
 * 스킬 비교 패널 화면
 *
 * @param data - 이름·내용 대조 결과
 */
export function SkillDiffPanel({ data }: AxPanelViewProps<AxSkillDiffData>) {
  return (
    <div className="space-y-10">
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        팀 스킬 {formatCount(data.basis.aitkSkills)}개 × 에이전트 스킬{' '}
        {formatCount(data.basis.agentSkills)}개 · 이름 겹침 중 문서 비교{' '}
        {formatCount(data.basis.comparedDocs)}건
        {data.fetchFailures > 0 && ` · 문서 조회 실패 ${formatCount(data.fetchFailures)}건`}
      </p>

      <DiffSection
        title="이름 같고 내용 동일"
        note="그대로 복사·동기화된 스킬 — 어느 쪽을 써도 같다"
        rows={data.identical}
        tone="same"
      />

      <DiffSection
        title="이름 같고 내용 유사"
        note="같은 스킬이 양쪽에서 각자 조금씩 수정된 상태 — 드리프트 정리 후보"
        rows={data.similar}
        tone="similar"
      />

      <DiffSection
        title="이름은 같지만 내용이 다름 (동명이인)"
        note="사실상 다른 스킬이 같은 이름을 쓰고 있다 — 혼동 위험, 이름 정리 후보"
        rows={data.different}
        tone="different"
      />

      <CrossMatches pairs={data.crossMatches} />

      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        판정 기준: frontmatter·공백을 정규화한 본문의 문자 3-그램 자카드 유사도. 유사/다름의
        경계는 50%다. 이 대조는 표시용이며, 두 소스의 수치를 합산하는 근거로 쓰지 않는다.
      </p>
    </div>
  )
}

/**
 * 판정 갈래 하나의 섹션 — 유사도 막대와 함께 나열
 *
 * @param title - 섹션 제목
 * @param note - 이 갈래의 해석 한 줄
 * @param rows - 해당 갈래의 스킬들
 * @param tone - 시각 톤 (동일=차분, 유사=중간, 다름=경고)
 */
function DiffSection({
  title,
  note,
  rows,
  tone,
}: {
  title: string
  note: string
  rows: AxSkillDiffRow[]
  tone: 'same' | 'similar' | 'different'
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className={SECTION_LABEL}>
          {title} · {formatCount(rows.length)}개
        </p>
        <p className="text-xs text-[var(--text-muted)]">{note}</p>
      </div>

      {rows.length === 0 ? (
        <p className={`mt-3 ${EMPTY_NOTE}`}>해당하는 스킬이 없습니다.</p>
      ) : tone === 'same' ? (
        // 동일 그룹은 유사도가 전부 100%라 막대가 무의미하다 — 이름만 격자로
        <ul className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id} className="truncate font-mono text-[13px] text-[var(--text-secondary)]">
              {row.id}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3">
              <span className="w-56 shrink-0 truncate font-mono text-[13px] text-[var(--text-primary)]">
                {row.id}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <span
                  className={`block h-full rounded-full ${
                    tone === 'different' ? 'bg-[var(--accent-orange)]' : 'bg-[var(--brand-primary)]'
                  }`}
                  style={{ width: `${Math.round((row.similarity ?? 0) * 100)}%` }}
                />
              </span>
              <span className="w-32 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {Math.round((row.similarity ?? 0) * 100)}% · {formatCount(row.aitkLength)}/
                {formatCount(row.agentLength)}자
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 교차 일치 — 이름은 다른데 내용이 완전히 같은 쌍
 *
 * @param pairs - aitk id ↔ 에이전트 id 쌍
 */
function CrossMatches({ pairs }: { pairs: AxSkillDiffData['crossMatches'] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className={SECTION_LABEL}>이름은 다른데 내용이 동일 · {formatCount(pairs.length)}쌍</p>
        <p className="text-xs text-[var(--text-muted)]">같은 문서가 다른 이름으로 존재 — 통합 후보</p>
      </div>
      {pairs.length === 0 ? (
        <p className={`mt-3 ${EMPTY_NOTE}`}>해당하는 쌍이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {pairs.map((pair) => (
            <li
              key={`${pair.aitkId}-${pair.agentId}`}
              className="flex flex-wrap items-center gap-2 font-mono text-[13px]"
            >
              <span className="text-[var(--text-primary)]">aitk:{pair.aitkId}</span>
              <span className="text-[var(--text-muted)]">=</span>
              <span className="text-[var(--text-secondary)]">agent:{pair.agentId}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
