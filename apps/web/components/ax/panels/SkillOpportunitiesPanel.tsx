'use client'

/**
 * AX 대시보드 — 스킬 개선 기회 패널 본문
 *
 * 분류마다 "무엇을 뜻하는가"와 "어떤 기준으로 걸렀는가"를 함께 적고, 근거가 되는 수치를 표로 보여준다.
 * 종합 점수 하나로 줄 세우지 않는다. 분류마다 취할 조치가 다르기 때문이다.
 */

import type { AxSkillOpportunitiesData, AxSkillOpportunityCategory } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount } from '../format'
import { EMPTY_NOTE, META_LINE, SECTION_LABEL, TD, TH } from './primitives'

/** 분류별 제목·설명·조치 */
const CATEGORY_TEXT: Record<AxSkillOpportunityCategory, { title: string; meaning: string; action: string }> = {
  low_load: {
    title: '검색에는 뜨는데 열리지 않음',
    meaning: '검색 결과에 자주 올라오지만 로드로 이어지지 않습니다',
    action: '이름과 설명이 무엇을 해주는 스킬인지 드러내는지 봅니다',
  },
  low_apply: {
    title: '열어 보고도 쓰지 않음',
    meaning: '로드까지는 되는데 적용 보고가 따라오지 않습니다',
    action: '지침이 실행 가능한지, 예시가 있는지 봅니다',
  },
  no_outcome: {
    title: '결과가 남지 않음',
    meaning: '로드한 뒤 적용도 건너뜀도 보고되지 않았습니다',
    action: '계측이 빠진 것인지, 판단이 미뤄진 것인지 가릅니다',
  },
  single_user: {
    title: '한 사람만 쓰고 있음',
    meaning: '여러 번 적용됐지만 쓰는 사람이 한 명입니다',
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
  const { groups, thresholds, searchRequests, zeroResultSearches } = data
  const populated = groups.filter((group) => group.total > 0)

  return (
    <div className="space-y-10">
      <p className={`${META_LINE} leading-relaxed`}>
        최근 {days}일 기준입니다. 검색 노출은 프롬프트마다 자동으로 도는 검색까지 포함하므로 사람이 눈으로 본
        횟수가 아닙니다. 순위가 아니라 손볼 후보를 추리는 용도로 봅니다.
      </p>

      {populated.length === 0 && (
        <p className={EMPTY_NOTE}>이 기간에는 기준을 넘은 스킬이 없습니다.</p>
      )}

      {populated.map((group) => {
        const text = CATEGORY_TEXT[group.category]
        const criteria = criteriaText(group.category, thresholds)
        return (
          <section key={group.category}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={SECTION_LABEL}>{text.title}</p>
              <p className={META_LINE}>
                {formatCount(group.total)}개
                {group.total > group.skills.length && ` 중 상위 ${formatCount(group.skills.length)}개`}
              </p>
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {text.meaning}. {text.action}.
            </p>
            <p className={`mt-1 ${META_LINE}`}>기준 · {criteria}</p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className={`${TH} w-[52%] text-left`}>스킬</th>
                    <th className={`${TH} text-right`}>노출</th>
                    <th className={`${TH} text-right`}>로드</th>
                    <th className={`${TH} text-right`}>적용</th>
                    <th className={`${TH} text-right`}>
                      {group.category === 'single_user' ? '적용한 사람' : '건너뜀'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {group.skills.map((skill) => (
                    <tr key={skill.skillId}>
                      <td className={`${TD} text-[var(--text-primary)]`}>{skill.name}</td>
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
                          ? `${formatCount(skill.appliers)}명`
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
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          결과가 한 줄도 없던 검색은 새 스킬 후보의 실마리입니다. 검색어 자체는 자유 입력이라 여기서는 건수만 셉니다.
        </p>
        <p className="mt-3 font-mono text-xl tabular-nums leading-none text-[var(--text-primary)]">
          {formatCount(zeroResultSearches)}
          <span className={`ml-2 ${META_LINE}`}>건 / 전체 검색 {formatCount(searchRequests)}건</span>
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
    return `로드 ${thresholds.minLoaded}건 이상이면서 적용·건너뜀이 모두 0건`
  }
  return `적용 ${thresholds.minApplied}건 이상이면서 적용한 사람이 1명`
}
