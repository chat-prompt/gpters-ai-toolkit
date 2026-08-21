'use client'

/**
 * AX 대시보드 — 스킬 사용량 패널 본문
 *
 * 화면 전체 폭을 쓰는 본문만 그린다. 제목·설명·출처는 껍데기가 그린다.
 * 전체 이벤트 수·사용자 수는 맨 위 핵심 지표 밴드가 이미 말하므로 여기서 되풀이하지 않는다.
 *
 * 조판은 두 층이다.
 * 1) 일자별 추이 막대 — 기간 전체의 모양을 먼저 보여준다
 * 2) 스킬 표 하나 — 순위·집계·마지막 사용까지 한 표에서 끝낸다
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
      {/* 이벤트 수·사용자 수는 상단 밴드에 이미 나가므로, 밴드에 없는 세션만 짚는다 */}
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {formatCount(data.sessions)}개 세션에서 사용
      </p>

      <DailyTrend daily={data.daily} days={days} />

      {data.skills.length > 0 ? (
        // 기간을 바꾸면 표를 통째로 다시 태워 첫 장으로 돌린다
        <SkillTable key={`${days}:${data.skills.length}`} skills={data.skills} />
      ) : (
        <p className={EMPTY_NOTE}>이 기간에 사용된 스킬이 없습니다.</p>
      )}

      {data.unusedSkills.length > 0 && <UnusedSkillsDetails skills={data.unusedSkills} />}
    </div>
  )
}

/**
 * 일자별 이벤트 추이 막대
 *
 * 최댓값 막대만 완전히 채우고 나머지는 옅게 깔아, 봉우리가 먼저 읽히게 한다.
 *
 * @param daily - 일자별 이벤트 수
 * @param days - 조회 기간(일). 데이터가 없을 때 안내 문구에만 쓴다
 */
function DailyTrend({ daily, days }: { daily: AxSkillUsageData['daily']; days: number }) {
  // 서버가 빈 날을 0으로 채워 내려주므로 길이가 아니라 합으로 판정한다 —
  // 전부 0인데 막대를 그리면 "최대 1건"이 활동처럼 읽힌다
  if (daily.length === 0 || daily.every((point) => point.events === 0)) {
    return <p className={EMPTY_NOTE}>최근 {days}일 동안 기록된 이벤트가 없습니다.</p>
  }

  const max = Math.max(1, ...daily.map((point) => point.events))
  const first = daily[0]
  const last = daily[daily.length - 1]

  return (
    <div>
      <div className="flex h-44 items-end gap-[2px]">
        {daily.map((point) => (
          <div
            key={point.date}
            className={`min-w-[2px] flex-1 rounded-t-[3px] bg-[var(--brand-primary)] transition-opacity duration-200 ${
              point.events === max ? 'opacity-100' : 'opacity-25 hover:opacity-60'
            }`}
            style={{ height: `${Math.max(2, (point.events / max) * 100)}%` }}
            title={`${formatDayLabel(point.date)} · ${formatCount(point.events)}건`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        <span>{first ? formatDayLabel(first.date) : ''}</span>
        <span>최대 {formatCount(max)}건</span>
        <span>{last ? formatDayLabel(last.date) : ''}</span>
      </div>
    </div>
  )
}

/**
 * 스킬 표 — 순위·집계·마지막 사용을 한 표에서 본다
 *
 * 스킬 이름 칸 안에만 사용량 비례 막대를 깔아, 숫자 칸을 침범하지 않으면서도
 * 표를 읽지 않고 순위 차이가 보이게 한다.
 *
 * @param skills - 사용량(로드+적용) 내림차순으로 정렬된 스킬 목록
 */
function SkillTable({ skills }: { skills: AxSkillUsageRow[] }) {
  const { rows: shown, pager } = usePagedRows(skills, SKILL_PAGE_SIZE)
  // 막대 기준은 어느 장을 보든 1위로 고정한다 — 장을 넘길 때 막대 길이가 바뀌면 안 된다
  const max = Math.max(1, ...skills.map(activity))

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-right ${TD} ${TH} w-12`}>순위</th>
              <th className={`text-left ${TD} ${TH} w-[30%]`}>스킬</th>
              <th className={`text-right ${TD} ${TH}`}>검색</th>
              <th className={`text-right ${TD} ${TH}`}>로드</th>
              <th className={`text-right ${TD} ${TH}`}>적용</th>
              <th className={`text-right ${TD} ${TH}`}>스킵</th>
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
                <td className={`relative ${TD}`}>
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
 * 기간 내 미사용 스킬 (접힘)
 *
 * 이름을 한 줄로 이어 붙이면 줄바꿈이 아무 데서나 일어나 읽히지 않는다.
 * 격자로 세워 한 칸에 한 이름씩 두고, 긴 이름은 잘라 칸을 지킨다.
 *
 * @param skills - 이벤트가 0인 스킬 목록
 */
function UnusedSkillsDetails({ skills }: { skills: AxSkillUsageData['unusedSkills'] }) {
  return (
    <details className="border-t border-[var(--border-subtle)] pt-5">
      <summary className="cursor-pointer list-none font-mono text-[11px] tabular-nums text-[var(--text-muted)] transition-colors duration-200 hover:text-[var(--text-primary)]">
        기간 내 미사용 스킬 {formatCount(skills.length)}개
        {/* 목록도 상한에서 잘리므로, 가득 찼을 때는 더 있을 수 있음을 밝힌다 */}
        {skills.length >= SKILL_ROW_LIMIT && ` · 최대 ${SKILL_ROW_LIMIT}개 표시`}
      </summary>
      <ul className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 md:grid-cols-3 xl:grid-cols-4">
        {skills.map((skill) => (
          <li
            key={skill.id}
            title={skill.name}
            className="truncate text-sm text-[var(--text-secondary)]"
          >
            {skill.name}
          </li>
        ))}
      </ul>
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
 * 순위를 가르는 활동량 — 실제로 쓰인 횟수(로드+적용)
 *
 * @param skill - 스킬 한 줄
 * @returns 로드와 적용의 합
 */
function activity(skill: AxSkillUsageRow): number {
  return skill.loaded + skill.applied
}

/**
 * 일자 라벨 (YYYY-MM-DD → "8월 3일")
 *
 * Date로 파싱하면 시간대에 따라 하루가 밀리므로 문자열을 그대로 쪼갠다.
 *
 * @param date - YYYY-MM-DD 형식 날짜
 * @returns "8월 3일". 형식이 다르면 입력을 그대로 돌려준다
 */
function formatDayLabel(date: string): string {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  return `${Number(parts[1])}월 ${Number(parts[2])}일`
}
