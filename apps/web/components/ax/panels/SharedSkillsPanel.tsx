'use client'

/**
 * AX 대시보드 — 에이전트 스킬(bbopters-shared) 패널 본문
 *
 * 저장소 인벤토리에 각 호스트 수집기가 보낸 **스킬 로드 실측**을 붙여 보여준다.
 *
 * 두 가지를 흐리지 않는 것이 이 화면의 일이다.
 * 1. 관측할 수 있는 수집기가 없으면 0을 그리지 않고 미관측이라고 적는다.
 * 2. 에이전트가 여는 스킬 대부분은 이 저장소 밖에 있다. 그 사실을 함께 보여주지 않으면
 *    저장소 스킬의 0이 계측 누락처럼 읽힌다.
 */

import type { AxSharedSkillsData } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDateTime } from '../format'
import { EmptyNote, SectionHeader, Stat, StatGrid, TD, TH } from './primitives'

/**
 * 공유 스킬 패널 화면
 *
 * @param data - 공유 스킬 인벤토리와 에이전트 로드 실측
 */
export function SharedSkillsPanel({ data }: AxPanelViewProps<AxSharedSkillsData>) {
  const used = data.skills
    .filter((skill) => (skill.agentLoads ?? 0) > 0)
    .sort((a, b) => (b.agentLoads ?? 0) - (a.agentLoads ?? 0) || a.id.localeCompare(b.id))

  return (
    <div className="space-y-10">
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {data.repo} · {formatCount(data.skills.length)}개
        {data.aitkOverlap !== null && ` · 팀 스킬(aitk)과 겹침 ${formatCount(data.aitkOverlap)}개`}
        {data.truncated && ' · 목록이 잘려 일부만 표시'}
      </p>

      {data.eventsConnected ? (
        <UsageSummary data={data} usedCount={used.length} />
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-hover)] px-5 py-4">
          <p className="text-sm text-[var(--text-secondary)]">
            스킬 로드를 관측할 수 있는 수집기의 배치가 아직 없습니다. 지금은 저장소에 어떤 스킬이
            있는지만 보여주며, 사용량은 0이 아니라 <strong>미관측</strong>입니다.
          </p>
        </div>
      )}

      {data.eventsConnected && (
        <section>
          <SectionHeader
            label="사용된 저장소 스킬"
            aside={`최근 ${data.usageWindowDays}일 · 로드 많은 순`}
          />
          {used.length > 0 ? <UsedSkillTable skills={used} /> : (
            <EmptyNote>
              최근 {data.usageWindowDays}일 동안 이 저장소의 스킬을 연 기록이 없습니다.
            </EmptyNote>
          )}
        </section>
      )}

      <section>
        <SectionHeader
          label="저장소 인벤토리"
          aside={`${formatCount(data.skills.length)}개`}
        />
        {data.skills.length > 0 ? (
          <SkillGrid skills={data.skills} />
        ) : (
          <EmptyNote>저장소에서 스킬을 찾지 못했습니다.</EmptyNote>
        )}
      </section>

      {data.unmatchedLoads.length > 0 && (
        <section>
          <SectionHeader
            label="저장소 밖 스킬 로드"
            aside={`최근 ${data.usageWindowDays}일 · 상위 ${formatCount(data.unmatchedLoads.length)}개`}
            description="에이전트가 열었지만 이 저장소에 없는 스킬입니다. 개인 스킬이거나 런타임에 딸려 오는 스킬일 수 있습니다."
          />
          <UnmatchedTable rows={data.unmatchedLoads} />
        </section>
      )}
    </div>
  )
}

/**
 * 로드 실측 요약
 *
 * @param data - 패널 데이터
 * @param usedCount - 로드가 한 번이라도 있은 저장소 스킬 수
 */
function UsageSummary({ data, usedCount }: { data: AxSharedSkillsData; usedCount: number }) {
  const outside = data.totalObservedLoads - data.matchedLoads
  return (
    <div className="space-y-4">
      <StatGrid columns={4}>
        <Stat
          label="관측 에이전트"
          value={formatCount(data.observedAgents)}
          unit="대"
          description="스킬 로드 신호를 보낼 수 있는 수집기가 붙은 에이전트 수입니다. 수집기가 없거나 구버전인 에이전트는 여기 들어가지 않습니다."
        />
        <Stat
          label="저장소 스킬 로드"
          value={formatCount(data.matchedLoads)}
          unit="건"
          hint={`${formatCount(usedCount)}종 / ${formatCount(data.skills.length)}종`}
          description="에이전트가 이 저장소의 스킬을 연 횟수입니다. 연 것이지 실행해서 성과를 냈다는 뜻은 아닙니다."
        />
        <Stat
          label="저장소 밖 로드"
          value={formatCount(outside)}
          unit="건"
          tone={outside > data.matchedLoads ? 'warning' : 'default'}
          hint={`관측 전체 ${formatCount(data.totalObservedLoads)}건 중`}
          description="에이전트가 열었지만 이 저장소에 없는 스킬입니다. 이 값이 크면 공유 저장소가 에이전트의 실제 스킬 출처가 아니라는 뜻입니다."
        />
        <Stat
          label="집계 창"
          value={formatCount(data.usageWindowDays)}
          unit="일"
          description="이 패널은 화면 위쪽 기간 필터를 쓰지 않는 스냅숏이라 집계 창을 고정합니다."
        />
      </StatGrid>
      <p className="max-w-[72ch] text-xs leading-relaxed text-[var(--text-secondary)]">
        로드는 각 호스트의 수집기가 보낸 실측입니다. 스킬 신호를 보낼 수 없는 소스(Codex)나
        구버전 수집기의 배치는 0이 아니라 집계에서 빠집니다.
      </p>
    </div>
  )
}

/**
 * 로드가 있는 저장소 스킬 표
 *
 * @param skills - 로드 내림차순으로 정렬된 스킬
 */
function UsedSkillTable({ skills }: { skills: AxSharedSkillsData['skills'] }) {
  return (
    // 넓은 화면에서 표를 끝까지 늘리면 이름과 숫자 사이가 멀어져 행을 눈으로 잇기 어렵다
    <div className="mt-4 max-w-[56rem] overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th scope="col" className={`${TH} text-left`}>스킬</th>
            <th scope="col" className={`${TH} text-right`}>로드</th>
            <th scope="col" className={`${TH} text-right`}>에이전트</th>
            <th scope="col" className={`${TH} text-left`}>마지막 로드</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {skills.map((skill) => (
            <tr key={skill.id}>
              <th scope="row" className={`${TD} text-left font-normal text-[var(--text-primary)]`}>
                <span className="break-words">{skill.id}</span>
                {skill.matchedByName && (
                  <span className="ml-2 font-mono text-[10px] text-[var(--text-muted)]">이름 매칭</span>
                )}
              </th>
              <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>
                {formatCount(skill.agentLoads ?? 0)}
              </td>
              <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                {formatCount(skill.agentCount)}
              </td>
              <td className={`${TD} text-left font-mono text-[11px] tabular-nums text-[var(--text-muted)]`}>
                {formatDateTime(skill.lastLoadedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
        “이름 매칭”은 수집기가 <code>플러그인:스킬</code> 형태로 보고한 값을 이름으로 맞춘 것입니다.
        같은 이름의 다른 스킬일 수 있습니다.
      </p>
    </div>
  )
}

/**
 * 저장소 밖 로드 표
 *
 * @param rows - 로드 내림차순 목록
 */
function UnmatchedTable({ rows }: { rows: AxSharedSkillsData['unmatchedLoads'] }) {
  return (
    <div className="mt-4 max-w-[36rem] overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th scope="col" className={`${TH} text-left`}>스킬 id</th>
            <th scope="col" className={`${TH} text-right`}>로드</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={`${TD} break-words text-left font-normal text-[var(--text-secondary)]`} translate="no">
                {row.id}
              </th>
              <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                {formatCount(row.loads)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 스킬 인벤토리 격자
 *
 * SKILL.md가 없는 디렉터리는 규격 미준수 후보이므로 표시를 다르게 한다.
 *
 * @param skills - 스킬 목록 (id 오름차순)
 */
function SkillGrid({ skills }: { skills: AxSharedSkillsData['skills'] }) {
  const missingDoc = skills.filter((skill) => !skill.hasSkillDoc)
  const overlapping = skills.filter((skill) => skill.inAitk)

  return (
    <div className="mt-4">
      <ul className="grid grid-cols-2 gap-x-8 gap-y-2 md:grid-cols-3 xl:grid-cols-4">
        {skills.map((skill) => (
          <li
            key={skill.id}
            title={skill.inAitk ? `${skill.path} · 팀 스킬(aitk)에도 등록됨` : skill.path}
            className={`flex items-center gap-1.5 truncate text-sm ${
              skill.hasSkillDoc ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            {skill.inAitk && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]"
              />
            )}
            <span className="truncate">
              {skill.id}
              {!skill.hasSkillDoc && ' *'}
            </span>
            {(skill.agentLoads ?? 0) > 0 && (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--accent-orange)]">
                {formatCount(skill.agentLoads ?? 0)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-1 text-xs leading-relaxed text-[var(--text-secondary)]">
        {overlapping.length > 0 && (
          <p>
            <span
              aria-hidden
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
            />
            같은 id가 팀 스킬(aitk)에도 등록된 스킬 {formatCount(overlapping.length)}개 —
            출처가 다르므로 사용량은 합산하지 않습니다.
          </p>
        )}
        {missingDoc.length > 0 && (
          <p>
            * SKILL.md가 없는 디렉터리 {formatCount(missingDoc.length)}개 — 스킬 규격을 갖추지
            않은 항목일 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}
