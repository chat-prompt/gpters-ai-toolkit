'use client'

/**
 * AX 대시보드 — 반복 사용과 정착률 패널 본문
 *
 * "다시 돌아오는가"를 팀 단위로만 보여준다. 주간 재방문, 신규·재사용자, 반복 깊이, 스킬별 재사용.
 * 개인을 지목하는 표는 없다.
 *
 * 수치는 전부 명시적 적용 보고의 실측이다. 흐름 ID 없는 보고를 이어 붙이지 않고, 관측이 없는 창은
 * 0이 아니라 "미관측"으로 적는다. 사람 수 기반 비율은 표본이 작아 `n/d · 참고`로 나온다.
 */

import type { AxRetentionData, AxRetentionWeek } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate, formatSampledRate } from '../format'
import { EmptyNote, META_LINE, SectionHeader, Stat, StatGrid, TD, TH } from './primitives'

/** 값이 없을 때의 기호 — format.ts의 EMPTY와 같다 */
const EMPTY = '—'
/** 관측 자체가 없었을 때의 표기 */
const UNOBSERVED = '미관측'

/**
 * 반복 사용 화면
 *
 * @param data - 반복 사용 집계
 * @param days - 조회 기간(일)
 */
export function RetentionPanel({ data, days }: AxPanelViewProps<AxRetentionData>) {
  const { users, weeks, skills, pairs, topSkills, totalMultiApplySkills, thresholds, firstObservedAt } = data
  const latest = weeks[weeks.length - 1]
  const hasData = users.active > 0 || weeks.some((week) => week.activeUsers > 0)

  return (
    <div className="space-y-10">
      <div>
        <p className="max-w-[72ch] text-xs leading-relaxed text-[var(--text-secondary)]">
          최근 {days}일 동안의 <strong className="font-medium text-[var(--text-primary)]">적용 보고</strong>만 셉니다.
          재사용은 같은 사용자가 같은 스킬을 서로 다른 날 {thresholds.reuseMinDays}일 이상 적용한 것입니다.
          같은 날의 반복 보고는 한 작업의 중복 보고인 경우가 있어 반복으로 세지 않고, 흐름 ID가 없는 보고를
          시간 근접으로 이어 붙이지도 않습니다.
        </p>
        <p className={`mt-2 ${META_LINE}`}>
          {firstObservedAt
            ? `적용 보고 관측 시작 ${formatDate(firstObservedAt)}`
            : '적용 보고가 아직 관측되지 않았습니다'}
          {data.anonymousApplies > 0 && ` · 계정 불명 적용 ${formatCount(data.anonymousApplies)}건은 사람 단위 지표에서 제외`}
        </p>
      </div>

      {!hasData && <EmptyNote>이 기간에는 적용 보고가 없습니다.</EmptyNote>}

      {hasData && (
        <StatGrid columns={4}>
          <Stat
            label="주간 재방문"
            value={latest ? retainedRate(latest) : EMPTY}
            hint={latest ? retainedHint(latest) : undefined}
            description={`오늘까지 ${thresholds.weekDays}일 창에서 적용을 보고한 사용자 중 직전 ${thresholds.weekDays}일 창에도 보고한 사람의 비율입니다. 기간 선택과 무관하게 같은 창입니다.`}
          />
          <Stat
            label="활성 사용자"
            value={formatCount(users.active)}
            unit="명"
            hint={`신규 ${formatCount(users.new)} · 재사용자 ${formatCount(users.returning)}`}
            description="이 기간에 적용을 보고한 고유 사용자입니다. 신규는 전 기간 최초 적용이 이 기간 안에 있는 사람, 재사용자는 기간 시작 전에도 적용 보고가 있던 사람입니다."
          />
          <Stat
            label="스킬을 다시 쓴 사용자"
            value={formatCount(users.reusing)}
            unit="명"
            hint={`활성 ${formatCount(users.active)}명 중`}
            description={`어떤 스킬이든 서로 다른 날 ${thresholds.reuseMinDays}일 이상 적용한 사용자입니다.`}
          />
          <Stat
            label="반복 사용된 스킬"
            value={formatCount(skills.reused)}
            unit="개"
            hint={`적용된 ${formatCount(skills.applied)}개 중 · 한 번만 ${formatCount(skills.single)}개`}
            description={`최소 한 사용자가 다른 날 다시 쓴 스킬입니다. 여러 번 적용됐지만 같은 사람이 다른 날 다시 쓴 적은 없는 스킬은 ${formatCount(skills.multipleWithoutReuse)}개입니다.`}
          />
        </StatGrid>
      )}

      {hasData && (
        <section aria-labelledby="ax-retention-weeks">
          <SectionHeader
            id="ax-retention-weeks"
            label="주간 재방문"
            aside={`${thresholds.weekDays}일 창 ${formatCount(weeks.length)}개 · 오늘까지`}
            description={`창은 오늘에서 ${thresholds.weekDays}일씩 거슬러 잡아 달력 주와 다릅니다. 재방문은 직전 창에도 적용을 보고한 사용자의 비율이고, 직전 창이 관측 시작보다 앞이면 미관측으로 둡니다.`}
          />
          <div className="mt-3 max-w-[48rem] overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th scope="col" className={`${TH} text-left`}>창</th>
                  <th scope="col" className={`${TH} text-right`}>활성</th>
                  <th scope="col" className={`${TH} text-right`}>직전 창</th>
                  <th scope="col" className={`${TH} text-right`}>재방문</th>
                  <th scope="col" className={`${TH} text-right`}>신규</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {weeks.map((week) => (
                  <tr key={week.start}>
                    <th scope="row" className={`${TD} whitespace-nowrap text-left font-mono text-[11px] font-normal tabular-nums text-[var(--text-secondary)]`}>
                      {formatWindow(week)}
                    </th>
                    <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>
                      {formatCount(week.activeUsers)}
                    </td>
                    <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                      {week.previousActiveUsers === null ? UNOBSERVED : formatCount(week.previousActiveUsers)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right font-mono tabular-nums text-[var(--text-primary)]`}>
                      {retainedRate(week)}
                    </td>
                    <td className={`${TD} text-right font-mono tabular-nums ${week.newUsers === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                      {formatCount(week.newUsers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {hasData && (
        <section aria-labelledby="ax-retention-depth">
          <SectionHeader
            id="ax-retention-depth"
            label="반복 깊이"
            aside={`사용자×스킬 조합 ${formatCount(pairs.total)}개`}
            description="한 사용자가 같은 스킬을 며칠에 걸쳐 적용했는지의 분포입니다. 요약 탭의 고유 스킬 수가 다양성이라면 이것은 같은 스킬로 돌아오는 깊이입니다."
          />
          <div className="mt-4">
            <StatGrid columns={3}>
              <Stat label="하루만" value={formatCount(pairs.oneDay)} unit="조합" />
              <Stat label="이틀" value={formatCount(pairs.twoDays)} unit="조합" />
              <Stat label="사흘 이상" value={formatCount(pairs.threePlusDays)} unit="조합" />
            </StatGrid>
          </div>
        </section>
      )}

      {hasData && (
        <section aria-labelledby="ax-retention-skills">
          <SectionHeader
            id="ax-retention-skills"
            label="스킬별 재사용"
            aside={
              totalMultiApplySkills > topSkills.length
                ? `두 번 이상 적용된 ${formatCount(totalMultiApplySkills)}개 중 상위 ${formatCount(topSkills.length)}개`
                : `두 번 이상 적용된 ${formatCount(totalMultiApplySkills)}개`
            }
            description="다시 쓴 사용자가 많은 순입니다. 최다 사용일은 한 사용자가 그 스킬을 적용한 서로 다른 날의 최댓값입니다."
          />
          {topSkills.length === 0 ? (
            <EmptyNote>이 기간에 두 번 이상 적용된 스킬이 없습니다.</EmptyNote>
          ) : (
            <div className="mt-3 max-w-[56rem] overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th scope="col" className={`${TH} w-[44%] text-left`}>스킬</th>
                    <th scope="col" className={`${TH} text-right`}>적용</th>
                    <th scope="col" className={`${TH} text-right`}>사용자</th>
                    <th scope="col" className={`${TH} text-right`}>다시 쓴 사용자</th>
                    <th scope="col" className={`${TH} text-right`}>최다 사용일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {topSkills.map((skill) => (
                    <tr key={skill.skillId}>
                      <th scope="row" className={`${TD} break-words text-left font-normal text-[var(--text-primary)]`}>
                        {skill.name}
                      </th>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                        {formatCount(skill.applies)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                        {formatCount(skill.users)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums ${skill.reusedUsers === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--accent-orange)]'}`}>
                        {formatCount(skill.reusedUsers)}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                        {formatCount(skill.maxActiveDays)}일
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * 창의 재방문 비율 표기 — 직전 창이 미관측이면 그렇게 적고, 표본이 작으면 분수로 둔다
 *
 * @param week - 7일 창
 * @returns 화면 표기
 */
function retainedRate(week: AxRetentionWeek): string {
  if (week.previousActiveUsers === null || week.retainedUsers === null) return UNOBSERVED
  return formatSampledRate(week.retainedUsers, week.previousActiveUsers)
}

/**
 * 수치 칸 아래 보조 문구 — 분모를 항상 드러낸다
 *
 * @param week - 7일 창
 * @returns "직전 7일 8명 중 7명" 형태
 */
function retainedHint(week: AxRetentionWeek): string {
  if (week.previousActiveUsers === null || week.retainedUsers === null) return '직전 창 관측 없음'
  return `직전 창 ${formatCount(week.previousActiveUsers)}명 중 ${formatCount(week.retainedUsers)}명`
}

/**
 * 창의 날짜 범위 — 끝은 미포함이라 하루를 빼서 적는다
 *
 * @param week - 7일 창
 * @returns "8. 29. – 9. 4." 형태
 */
function formatWindow(week: AxRetentionWeek): string {
  // 끝은 UTC 자정(미포함)이라 하루를 빼야 마지막 날이 된다. 1ms만 빼면 KST 표기에서 다음 날로 넘어간다
  const lastDay = new Date(new Date(week.end).getTime() - 24 * 60 * 60 * 1000)
  return `${formatDate(week.start)} – ${formatDate(lastDay.toISOString())}`
}
