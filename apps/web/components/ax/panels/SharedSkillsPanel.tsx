'use client'

/**
 * AX 대시보드 — 에이전트 스킬(bbopters-shared) 패널 본문
 *
 * 사내 에이전트 공용 스킬 저장소의 인벤토리를 격자로 보여준다.
 * 실행 이벤트는 아직 미연결이므로, 사용량처럼 보이는 숫자를 만들지 않고
 * "인벤토리만 연결됨" 상태를 본문 맨 위에서 밝힌다.
 */

import type { AxSharedSkillsData } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { EMPTY_NOTE } from './primitives'
import { formatCount } from '../format'

/**
 * 공유 스킬 패널 화면
 *
 * @param data - 공유 스킬 인벤토리
 */
export function SharedSkillsPanel({ data }: AxPanelViewProps<AxSharedSkillsData>) {
  return (
    <div className="space-y-10">
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {data.repo} · {formatCount(data.skills.length)}개
        {data.aitkOverlap !== null && ` · 팀 스킬(aitk)과 겹침 ${formatCount(data.aitkOverlap)}개`}
        {data.truncated && ' · 목록이 잘려 일부만 표시'}
      </p>

      {!data.eventsConnected && (
        <p className={EMPTY_NOTE}>
          실행 이벤트 수집은 아직 연결되지 않았습니다. 지금은 저장소에 어떤 스킬이 있는지만
          보여주며, 에이전트별 사용량은 수집 계약이 정해진 뒤 붙습니다.
        </p>
      )}

      {data.skills.length > 0 ? (
        <SkillGrid skills={data.skills} />
      ) : (
        <p className="border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
          저장소에서 스킬을 찾지 못했습니다.
        </p>
      )}
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
    <div>
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
              <>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]"
                />
                <span className="sr-only">팀 스킬에도 등록됨 · </span>
              </>
            )}
            <span className="truncate">
              {skill.id}
              {!skill.hasSkillDoc && (
                <>
                  <span aria-hidden> *</span>
                  <span className="sr-only"> · SKILL.md 없음</span>
                </>
              )}
            </span>
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
