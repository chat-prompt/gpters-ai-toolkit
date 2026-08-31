'use client'

/**
 * AX 대시보드 — 스킬 사용량 패널 본문
 *
 * 화면 전체 폭을 쓰는 본문만 그린다. 제목·설명·출처는 껍데기가 그린다.
 * 전체 이벤트 수·사용자 수는 맨 위 핵심 지표 밴드가 이미 말하므로 여기서 되풀이하지 않는다.
 *
 * 검색·로드·적용 보고와 스킬별 관측 순위, 장기 미관측 정리 후보를 보여준다.
 * 날짜별 활동량은 상단 365일 잔디와 겹치므로 이 패널에서 반복하지 않는다.
 */

import type { AxSkillUsageData, AxSkillUsageRow } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate } from '../format'
import { TablePager, usePagedRows } from './TablePager'

/** 표에 실리는 스킬 수 상한 — 데이터 계층의 상한과 같아야 한다 */
const SKILL_ROW_LIMIT = 50

/** 한 장에 실을 스킬 수 */
const SKILL_PAGE_SIZE = 20

/** 표 머리칸 공통 스타일 */
const TH = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-normal'

/** 표 본문칸 공통 여백 */
const TD = 'py-2.5 px-3'

/** 데이터가 비었을 때의 조용한 안내문 */
const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

/**
 * 스킬 사용량 패널 화면
 *
 * @param data - 스킬 사용량 집계
 * @param days - 조회 기간(일)
 */
export function SkillUsagePanel({ data, days }: AxPanelViewProps<AxSkillUsageData>) {
  return (
    <div className="space-y-10">
      {/* 이벤트 수·사용자 수는 상단 밴드에 이미 나가므로, 밴드에 없는 대화 세션만 짚는다 */}
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        실제 적용 보고가 기록된 {formatCount(data.sessions)}개 대화 세션 · 서버 관측 독립 이벤트{' '}
        {formatCount(data.totalEvents)}건
      </p>

      <ActionEventSummary totals={data.actionTotals} />

      {data.skills.length > 0 ? (
        // 기간을 바꾸면 표를 통째로 다시 태워 첫 장으로 돌린다
        <SkillTable key={`${days}:${data.skills.length}`} skills={data.skills} />
      ) : (
        <p className={EMPTY_NOTE}>이 기간에 사용된 스킬이 없습니다.</p>
      )}

      {data.unusedSkills.length > 0 && (
        <UnusedSkillsDetails skills={data.unusedSkills} total={data.totalUnusedSkills} />
      )}
    </div>
  )
}

/** 검색 노출·로드·적용 보고를 독립 이벤트로 보여준다 */
function ActionEventSummary({ totals }: { totals: AxSkillUsageData['actionTotals'] }) {
  const steps = [
    { label: '검색 노출', value: totals.search },
    { label: '로드', value: totals.load },
    { label: '적용 보고', value: totals.apply },
  ]

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        행동별 이벤트 · 독립 집계
      </p>
      <div className="mt-3 grid max-w-2xl grid-cols-3 divide-x divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {steps.map((step) => (
          <div key={step.label} className="px-4 py-3 first:pl-0">
            <p className="text-xs text-[var(--text-secondary)]">{step.label}</p>
            <p className="mt-1 font-mono text-xl tabular-nums text-[var(--text-primary)]">
              {formatCount(step.value)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        검색 노출은 검색 결과에 스킬이 나타날 때마다, 로드는 콘텐츠를 조회할 때마다, 적용은
        결과를 보고할 때마다 따로 기록됩니다. 같은 세션의 순차 전환율이 아니므로 앞 단계보다
        뒤 단계가 클 수 있습니다. 로컬에 저장한 뒤 서버 호출 없이 재사용한 횟수는 관측할 수
        없어 포함하지 않습니다.
      </p>
    </div>
  )
}

/**
 * 스킬 표 — 순위·집계·마지막 사용을 한 표에서 본다
 *
 * 스킬 이름 칸 안에만 사용량 비례 막대를 깔아, 숫자 칸을 침범하지 않으면서도
 * 표를 읽지 않고 순위 차이가 보이게 한다.
 *
 * @param skills - 실제 적용 보고 내림차순으로 정렬된 스킬 목록
 */
function SkillTable({ skills }: { skills: AxSkillUsageRow[] }) {
  const { rows: shown, pager } = usePagedRows(skills, SKILL_PAGE_SIZE)
  // 막대 기준은 어느 장을 보든 1위로 고정한다 — 장을 넘길 때 막대 길이가 바뀌면 안 된다
  const max = Math.max(1, ...skills.map(activity))

  return (
    <div>
      <p className="mb-3 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        스킬별 독립 이벤트 · 순위와 주황색 바는 실제 적용 보고 기준(1위=100%)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-right ${TD} ${TH} w-12`}>순위</th>
              <th className={`text-left ${TD} ${TH} w-[30%]`}>스킬</th>
              <th className={`text-right ${TD} ${TH}`}>검색 노출</th>
              <th className={`text-right ${TD} ${TH}`}>로드</th>
              <th className={`text-right ${TD} ${TH}`}>적용 보고</th>
              <th className={`text-right ${TD} ${TH}`}>스킵 보고</th>
              <th className={`text-right ${TD} ${TH}`}>사용자</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 사용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {shown.map((skill, index) => (
              <tr
                key={skill.skillId}
                className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
              >
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-muted)]`}>
                  {/* 순위는 장이 넘어가도 이어진다 */}
                  {pager.from + index}
                </td>
                <td
                  className={`relative ${TD}`}
                  title={`선택 기간 실제 적용 보고 ${formatCount(activity(skill))}건 · 1위 대비 ${Math.round((activity(skill) / max) * 100)}%`}
                >
                  {/* 사용량 비례 막대 — 이름 칸 안에서만 찬다 */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--brand-primary)]/[0.07]"
                    style={{ width: `${(activity(skill) / max) * 100}%` }}
                  />
                  <span className="relative text-[var(--text-primary)]">{skill.name}</span>
                </td>
                <NumberCell value={skill.searched} />
                <NumberCell value={skill.loaded} />
                <NumberCell value={skill.applied} emphasized />
                <NumberCell value={skill.skipped} />
                <NumberCell value={skill.users} />
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-muted)]`}>
                  {formatDate(skill.lastUsedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          카탈로그에 등록된 스킬 기준
          {skills.length >= SKILL_ROW_LIMIT && ` · 사용량 상위 ${SKILL_ROW_LIMIT}개까지`}
        </span>
        <TablePager {...pager} />
      </div>
    </div>
  )
}

/**
 * 기간 내 실제 적용 보고가 없는 스킬 정리 우선순위 (접힘)
 *
 * 이름을 한 줄로 이어 붙이면 줄바꿈이 아무 데서나 일어나 읽히지 않는다.
 * 격자로 세워 한 칸에 한 이름씩 두고, 긴 이름은 잘라 칸을 지킨다.
 *
 * @param skills - 이벤트가 0인 스킬 목록
 */
function UnusedSkillsDetails({
  skills,
  total,
}: {
  skills: AxSkillUsageData['unusedSkills']
  total: number
}) {
  return (
    <details className="border-t border-[var(--border-subtle)] pt-5">
      <summary className="cursor-pointer list-none font-mono text-[11px] tabular-nums text-[var(--text-muted)] transition-colors duration-200 hover:text-[var(--text-primary)]">
        기간 내 실제 적용 보고 없는 스킬 {formatCount(total)}개
        {total > skills.length && ` · 정리 우선순위 상위 ${formatCount(skills.length)}개 표시`}
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
        한 번도 적용 보고가 관측되지 않은 스킬부터, 마지막 적용이 오래되고 누적 적용 세션이 적은
        순서입니다. 검색 노출과 로드·스킵은 실제 사용에서 제외하며, 서버 호출 없는 로컬 재사용은 알 수 없습니다.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH}`}>스킬</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 실제 적용</th>
              <th className={`text-right ${TD} ${TH}`}>누적 적용 세션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {skills.map((skill) => (
              <tr key={skill.id} className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]">
                <td className={`${TD} text-[var(--text-primary)]`}>{skill.name}</td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-muted)]`}>
                  {skill.lastUsedAt === null ? '관측 기록 없음' : formatDate(skill.lastUsedAt)}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {formatCount(skill.usageSessions)}회
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/**
 * 수치 한 칸 — 0은 눌러서 0이 아닌 값이 먼저 읽히게 한다
 *
 * @param value - 숫자 값
 * @param emphasized - 주요 지표 여부. 0이 아닐 때 더 진하게 찍는다
 */
function NumberCell({ value, emphasized = false }: { value: number; emphasized?: boolean }) {
  const tone =
    value === 0
      ? 'text-[var(--text-muted)]'
      : emphasized
        ? 'text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)]'

  return <td className={`text-right ${TD} font-mono tabular-nums ${tone}`}>{formatCount(value)}</td>
}

/**
 * 순위를 가르는 실제 사용량 — 적용 보고
 *
 * @param skill - 스킬 한 줄
 * @returns 적용 보고 수
 */
function activity(skill: AxSkillUsageRow): number {
  return skill.applied
}
