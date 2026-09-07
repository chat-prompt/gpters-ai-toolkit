'use client'

/**
 * AX 대시보드 — 카탈로그 내부 중복 패널 본문
 *
 * 같은 문서가 여러 id로 등록된 후보를 묶음 단위로 보여준다.
 * `skill-diff`가 카탈로그 ↔ 에이전트 저장소 교차 비교라면, 이 화면은 카탈로그 안쪽만 본다.
 *
 * 이 화면은 "합쳐라"라고 말하지 않는다. 의도적으로 갈라놓은 워크플로 단계도 어휘가 겹치면
 * 높게 나오므로, 유사도는 사람이 볼 순서를 정하는 값이고 결정은 처리 절차 문서가 맡는다.
 */

import type { AxSkillDuplicateData, AxSkillDuplicateGroup, AxSkillDuplicatePair } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount } from '../format'
import { EMPTY_NOTE, META_LINE, SECTION_LABEL, TD, TH } from './primitives'

/**
 * 카탈로그 중복 패널 화면
 *
 * @param data - 중복 후보 묶음과 쌍 목록
 */
export function SkillDuplicatesPanel({ data }: AxPanelViewProps<AxSkillDuplicateData>) {
  const multiGroups = data.groups.filter((group) => group.ids.length > 2)

  return (
    <div className="space-y-10">
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        스킬 {formatCount(data.basis.skills)}개 중 본문이 있는 {formatCount(data.basis.compared)}개를
        서로 비교 · 유사도 {data.basis.threshold.toFixed(2)} 이상을 후보로 올린다 ·
        본문 전체를 자르지 않고 비교한다
      </p>

      <TrendSection data={data} />

      <section className="space-y-4">
        <h3 className={SECTION_LABEL}>판단 단위 묶음</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          유사도 {data.basis.groupThreshold.toFixed(2)} 이상만 이어 붙인다 — 후보 경계로 이으면
          어휘가 겹치는 스킬이 사슬로 줄줄이 엮여 판단 단위가 되지 못한다.
          셋 이상이 같은 문서인 경우가 있어 쌍이 아니라 묶음으로 센다. 한 묶음에 결정 하나를 내린다.
          <span className="text-[var(--text-muted)]">
            {' '}적용 이력이 있는 id에 표시가 붙는다 — 무엇을 남길지 고르는 근거다.
          </span>
        </p>
        {data.groups.length === 0 ? (
          <p className={EMPTY_NOTE}>중복 후보가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {data.groups.map((group) => (
              <GroupRow key={group.ids.join('|')} group={group} />
            ))}
          </ul>
        )}
        {multiGroups.length > 0 && (
          <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
            셋 이상 묶인 것 {formatCount(multiGroups.length)}건 — 같은 원본을 이름만 바꿔 여러 번 등록한 형태다
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h3 className={SECTION_LABEL}>유사도 높은 쌍</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          문자 3-그램 자카드. 1.00은 공백·머리말을 정리한 뒤 본문이 같다는 뜻이다.
        </p>
        {data.pairs.length === 0 ? (
          <p className={EMPTY_NOTE}>후보 쌍이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full max-w-[64rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left">
                  <th scope="col" className={`${TH} w-20`}>유사도</th>
                  <th scope="col" className={TH}>A</th>
                  <th scope="col" className={TH}>B</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair) => (
                  <PairRow key={`${pair.left.id}|${pair.right.id}`} pair={pair} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.truncated > 0 && (
          <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
            유사도 낮은 순으로 {formatCount(data.truncated)}쌍을 줄였습니다 (전체 {formatCount(data.pairCount)}쌍)
          </p>
        )}
      </section>
    </div>
  )
}


/**
 * 정리가 먹히고 있나 — 일별 스냅숏 추세.
 *
 * 스냅숏이 없으면 0을 그리지 않고 "아직 모른다"고 적는다. 카탈로그는 과거 상태를 보존하지 않아
 * 소급 계산이 불가능하므로, 비어 있는 것은 진짜로 관측 이전이라는 뜻이다.
 */
function TrendSection({ data }: { data: AxSkillDuplicateData }) {
  const { trend, trendSummary } = data

  if (trend.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className={SECTION_LABEL}>추세</h3>
        <p className={EMPTY_NOTE}>
          아직 스냅숏이 없습니다. 매일 한 번 찍히며, 이틀치가 쌓이면 늘고 있는지 줄고 있는지 나옵니다.
        </p>
      </section>
    )
  }

  const max = Math.max(1, ...trend.map((row) => row.duplicateGroups))

  return (
    <section className="space-y-3">
      <h3 className={SECTION_LABEL}>추세</h3>
      <p className="text-sm text-[var(--text-secondary)]">
        중복 묶음이 늘고 있는지 본다. 한 번 치우고 끝나는 일이 아니라, 새로 쌓이는 속도가 더 중요하다.
      </p>

      <div className="flex h-16 items-end gap-[3px] overflow-x-auto">
        {trend.map((row) => (
          <div
            key={row.date}
            className="min-w-[6px] flex-1 rounded-t-[2px] bg-[var(--accent-orange)]"
            style={{ height: `${Math.max(row.duplicateGroups > 0 ? 4 : 0, (row.duplicateGroups / max) * 100)}%` }}
            title={`${row.date} · 중복 묶음 ${row.duplicateGroups} · 로드 0건 ${row.neverLoaded}/${row.totalItems}`}
          />
        ))}
      </div>

      {trendSummary === null ? (
        <p className={META_LINE}>
          스냅숏 {formatCount(trend.length)}일치 — 늘고 있는지 줄고 있는지는 이틀치부터 판정한다
        </p>
      ) : (
        <p className={META_LINE}>
          {trendSummary.from} → {trendSummary.to} · 중복 묶음{' '}
          <span className="text-[var(--text-primary)]">{signed(trendSummary.duplicateGroupsDelta)}</span> · 로드 0건{' '}
          <span className="text-[var(--text-primary)]">{signed(trendSummary.neverLoadedDelta)}</span>
          {trendSummary.worsening ? ' · 늘고 있다' : ' · 늘지 않았다'}
        </p>
      )}
    </section>
  )
}

/** 증감을 부호와 함께. 0은 변화 없음으로 읽히게 둔다 */
function signed(value: number): string {
  if (value === 0) return '변화 없음'
  return value > 0 ? `+${formatCount(value)}` : `−${formatCount(Math.abs(value))}`
}

/** 묶음 한 줄 — 소속 id와 적용 이력 표시 */
function GroupRow({ group }: { group: AxSkillDuplicateGroup }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-2 border-[var(--border-hover)] pl-4">
      {group.ids.map((id) => {
        const applied = group.appliedIds.includes(id)
        return (
          // 문자 구분자 대신 칩으로 가른다 — 좁은 폭에서 줄바꿈되면 구분자가 줄머리로 넘어간다
          <span
            key={id}
            className={`rounded border px-2 py-0.5 font-mono text-[12px] ${
              applied
                ? 'border-[var(--border-hover)] text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
            title={applied ? '적용 이력 있음' : '적용 이력 없음'}
          >
            {id}
            {applied && <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">사용</span>}
          </span>
        )
      })}
    </li>
  )
}

/** 쌍 한 줄 */
function PairRow({ pair }: { pair: AxSkillDuplicatePair }) {
  return (
    <tr className="border-b border-[var(--border-subtle)] align-top">
      <td className={`${TD} font-mono tabular-nums`}>
        <div>{pair.similarity.toFixed(3)}</div>
        {pair.identical && <div className="text-[11px] text-[var(--text-muted)]">동일</div>}
      </td>
      <SideCell side={pair.left} />
      <SideCell side={pair.right} />
    </tr>
  )
}

/** 쌍의 한쪽 — id, 등록자, 적용 수 */
function SideCell({ side }: { side: AxSkillDuplicatePair['left'] }) {
  return (
    <td className={TD}>
      <div className="font-mono text-[12px] text-[var(--text-primary)]">{side.id}</div>
      <div className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {side.authorName ?? '작성자 없음'}
        {side.applies > 0 && ` · 적용 ${formatCount(side.applies)}`}
      </div>
    </td>
  )
}
