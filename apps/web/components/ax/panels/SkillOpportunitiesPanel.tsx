'use client'

/**
 * AX 대시보드 — 스킬 개선 기회 패널 본문
 *
 * 분류마다 "무엇을 뜻하는가"와 "어떤 기준으로 걸렀는가"를 함께 적고, 근거가 되는 수치를 표로 보여준다.
 * 종합 점수 하나로 줄 세우지 않는다. 분류마다 취할 조치가 다르기 때문이다.
 *
 * 수치는 기간 안의 총합을 견준 것이지 하나의 흐름을 따라간 전환율이 아니다. 문구도 "전환"이라 말하지 않는다.
 * 흐름을 따라간 전환은 구성원 사용 탭의 깔때기와 탐색·결과 분석이 담당한다.
 */

import type { AxSkillOpportunitiesData, AxSkillOpportunityCategory } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount } from '../format'
import { EMPTY_NOTE, META_LINE, SECTION_LABEL, SectionHeader, TD, TH } from './primitives'

/** 분류별 제목·설명·조치 */
const CATEGORY_TEXT: Record<AxSkillOpportunityCategory, { title: string; meaning: string; action: string }> = {
  low_load: {
    title: '노출은 많고 로드는 적음',
    meaning: '검색 결과에 자주 올라오지만 로드 수가 그에 못 미칩니다',
    action: '이름과 설명이 무엇을 해주는 스킬인지 드러내는지 봅니다',
  },
  low_apply: {
    title: '로드는 많고 적용은 적음',
    meaning: '로드 수에 비해 적용 보고가 적습니다',
    action: '지침이 실행 가능한지, 예시가 있는지 봅니다',
  },
  no_outcome: {
    title: '결과 보고가 없음',
    meaning: '로드는 있는데 적용도 건너뜀도 보고되지 않았습니다',
    action: '계측이 빠진 것인지, 판단이 미뤄진 것인지 가릅니다',
  },
  single_user: {
    title: '한 사람만 쓰고 있음',
    meaning: '여러 번 적용됐지만 보고한 계정이 하나입니다',
    action: '사내에 알릴 후보입니다',
  },
}

/**
 * 스킬 개선 기회 화면
 *
 * @param data - 분류 결과와 기준값
 * @param days - 조회 기간(일)
 */
export function SkillOpportunitiesPanel({ data, days }: AxPanelViewProps<AxSkillOpportunitiesData>) {
  const { groups, thresholds, searchRequests, observedSearches, zeroResultSearches } = data
  const populated = groups.filter((group) => group.total > 0)

  return (
    <div className="space-y-10">
      <div>
        <p className="max-w-[72ch] text-xs leading-relaxed text-[var(--text-secondary)]">
          최근 {days}일 동안의 <strong className="font-medium text-[var(--text-primary)]">총합</strong>을 견줍니다.
          하나의 흐름을 따라간 전환율이 아닙니다. 같은 스킬을 검색 없이 바로 열거나 다른 흐름에서 적용할 수
          있으므로, 순위가 아니라 손볼 후보를 추리는 용도로 봅니다. 흐름을 따라간 전환은 구성원 사용 탭의
          깔때기와 탐색·결과 분석에 있습니다.
        </p>
        <p className={`mt-2 ${META_LINE}`}>
          검색 노출에는 프롬프트마다 자동으로 도는 검색이 포함됩니다 · 사람이 눈으로 본 횟수가 아닙니다
        </p>
        {days > 30 && (
          <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-[var(--text-muted)]">
            검색 요청 수는 30일 보존 대상으로 설정된 감사 로그를 사용합니다. 정리 작업 실행 상태에 따라 90일
            구간이 불완전할 수 있으며, 현재 남아 있는 로그만 포함합니다. 스킬별 노출·로드·적용은 영향받지 않습니다.
          </p>
        )}
      </div>

      {populated.length === 0 && (
        <p className={EMPTY_NOTE}>이 기간에는 기준을 넘은 스킬이 없습니다.</p>
      )}

      {populated.map((group) => {
        const text = CATEGORY_TEXT[group.category]
        const headingId = `ax-opportunity-${group.category}`
        const lastColumnLabel = group.category === 'single_user' ? '적용한 계정' : '건너뜀 보고'
        return (
          <section key={group.category} aria-labelledby={headingId}>
            <SectionHeader
              id={headingId}
              label={text.title}
              aside={
                group.total > group.skills.length
                  ? `${formatCount(group.total)}개 중 상위 ${formatCount(group.skills.length)}개`
                  : `${formatCount(group.total)}개`
              }
              description={`${text.meaning}. ${text.action}.`}
            />
            <p className={`mt-1 ${META_LINE}`}>기준 · {criteriaText(group.category, thresholds)}</p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th scope="col" className={`${TH} w-[52%] text-left`}>스킬</th>
                    <th scope="col" className={`${TH} text-right`}>노출</th>
                    <th scope="col" className={`${TH} text-right`}>로드</th>
                    <th scope="col" className={`${TH} text-right`}>적용</th>
                    <th scope="col" className={`${TH} text-right`}>{lastColumnLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {group.skills.map((skill) => (
                    <tr key={skill.skillId}>
                      <th scope="row" className={`${TD} break-words text-left font-normal text-[var(--text-primary)]`}>
                        {skill.name}
                      </th>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                        {formatCount(skill.shown)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                        {formatCount(skill.loaded)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                        {formatCount(skill.applied)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-muted)]`}>
                        {group.category === 'single_user'
                          ? `${formatCount(skill.appliers)}개`
                          : formatCount(skill.skipped)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      <section>
        <p className={SECTION_LABEL}>없는 스킬을 찾은 검색</p>
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-[var(--text-secondary)]">
          결과가 한 줄도 없던 검색은 새 스킬 후보의 실마리입니다. 검색어 자체는 자유 입력이라 건수만 셉니다.
          결과 목록이 기록된 요청만 셀 수 있으므로, 기록이 없는 요청은 분모에서 뺐습니다.
        </p>
        <p className="mt-3 font-mono text-xl tabular-nums leading-none text-[var(--text-primary)]">
          {formatCount(zeroResultSearches)}
          <span className={`ml-2 ${META_LINE}`}>
            건 / 결과를 확인할 수 있는 검색 {formatCount(observedSearches)}건
            {observedSearches < searchRequests && ` (전체 ${formatCount(searchRequests)}건)`}
          </span>
        </p>
      </section>
    </div>
  )
}

/**
 * 분류에 쓴 기준을 사람이 읽는 문장으로 만든다
 *
 * @param category - 분류
 * @param thresholds - 서버가 내려준 기준값
 * @returns 화면에 적을 기준 설명
 */
function criteriaText(
  category: AxSkillOpportunityCategory,
  thresholds: AxSkillOpportunitiesData['thresholds']
): string {
  const loadPercent = Math.round(thresholds.loadRate * 100)
  const applyPercent = Math.round(thresholds.applyRate * 100)
  if (category === 'low_load') {
    return `노출 ${thresholds.minShown}건 이상이면서 로드가 노출의 ${loadPercent}% 미만`
  }
  if (category === 'low_apply') {
    return `로드 ${thresholds.minLoaded}건 이상이면서 적용이 로드의 ${applyPercent}% 미만`
  }
  if (category === 'no_outcome') {
    return `로드 ${thresholds.minLoaded}건 이상이면서 적용·건너뜀 보고가 모두 0건 (자동 스킵 제외)`
  }
  return `적용 ${thresholds.minApplied}건 이상, 보고한 계정 1개, 계정 불명 보고 없음`
}
