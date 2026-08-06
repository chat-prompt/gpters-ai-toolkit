'use client'

/**
 * AX 대시보드 — 배포 사이트 패널 본문
 *
 * 화면 전체 폭을 쓰는 본문만 그린다. 제목·설명·출처는 껍데기가 그린다.
 * 사이트가 수십~수백 개라 최근 배포 순으로 한 표에 세우고 25개씩 끊어 넘긴다.
 * 상태는 알약 배지 대신 점 하나와 글자로 조용히 표시한다.
 */

import type { AxVercelData, AxVercelProject } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDateTime } from '../format'
import { TablePager, usePagedRows } from './TablePager'

/** 한 장에 실을 사이트 수 */
const PROJECT_PAGE_SIZE = 25

/**
 * 사이트 설명 — 손으로 관리한다
 *
 * Vercel에는 프로젝트 설명 필드가 없어서 여기 적어 둔다.
 * 새 사이트가 생기면 한 줄 추가하면 되고, 모르는 사이트는 비워 둔다 (지어내지 않는다).
 */
const SITE_NOTES: Record<string, string> = {
  'gpters-portal': 'GPTers 회원·커뮤니티 포털',
  rona_practice: 'Rona 실습 플랫폼',
  'ai-study-lms': 'AI 스터디 LMS',
  'gpters-b2b-landing': 'B2B 랜딩 페이지',
  'bbojjak-viewer': '뽀짝이 라이브러리',
  'talent-hub-site': '인재 허브',
  'ai-study-dashboard': 'AI 스터디 대시보드',
  'ax-lab-board': '사내 AX 실험 보드',
}

/** 상태별 점 색 — 성공은 초록, 실패는 주황, 그 외 진행 상태는 무채색 */
const STATE_DOTS: Record<string, string> = {
  READY: 'bg-[var(--accent-green)]',
  ERROR: 'bg-[var(--accent-orange)]',
}

/** 상태 코드를 사람이 읽는 말로 */
const STATE_LABELS: Record<string, string> = {
  READY: '정상',
  ERROR: '실패',
  BUILDING: '빌드 중',
  QUEUED: '대기 중',
  CANCELED: '취소됨',
  INITIALIZING: '준비 중',
}

/** 아직 끝나지 않은 배포 — 점이 깜빡인다 */
const IN_FLIGHT_STATES = new Set(['BUILDING', 'QUEUED', 'INITIALIZING'])

/** 표 머리칸 공통 스타일 */
const TH = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-normal'

/** 표 본문칸 공통 여백 */
const TD = 'py-2.5 px-3'

/**
 * 배포 사이트 패널 화면
 *
 * @param data - 프로젝트 목록
 * @param days - 조회 기간(일). 기간이 바뀌면 첫 장으로 되돌리는 데만 쓴다
 */
export function VercelProjectsPanel({ data, days }: AxPanelViewProps<AxVercelData>) {
  if (data.projects.length === 0) {
    return (
      <p className="border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
        운영 중인 사이트가 없습니다.
      </p>
    )
  }

  // 기간을 바꾸거나 목록이 바뀌면 표를 통째로 다시 태워 첫 장으로 돌린다
  return <ProjectTable key={`${days}:${data.projects.length}`} projects={data.projects} />
}

/**
 * 사이트 표 — 25개씩 끊어 넘긴다
 *
 * @param projects - 최근 배포 순으로 정렬된 사이트 목록 (비어 있지 않다)
 */
function ProjectTable({ projects }: { projects: AxVercelProject[] }) {
  const { rows: shown, pager } = usePagedRows(projects, PROJECT_PAGE_SIZE)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH} w-24`}>상태</th>
              <th className={`text-left ${TD} ${TH} w-[26%]`}>사이트</th>
              <th className={`text-left ${TD} ${TH}`}>도메인</th>
              <th className={`text-right ${TD} ${TH} w-36`}>최근 배포</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {shown.map((project) => (
              <tr
                key={project.id}
                className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
              >
                <td className={TD}>
                  <span className="flex items-center gap-2">
                    <StateDot state={project.lastDeploymentState} />
                    <span className="text-[var(--text-secondary)] whitespace-nowrap">
                      {stateLabel(project.lastDeploymentState)}
                    </span>
                  </span>
                </td>
                <td className={TD}>
                  {/* 사이트 이름은 사람 말이 아니라 식별자라 모노스페이스로 둔다 */}
                  <span className="block font-mono text-sm text-[var(--text-primary)]">
                    {project.name}
                  </span>
                  <SiteNote name={project.name} />
                </td>
                <td className={`max-w-0 ${TD}`}>
                  <ProjectLink url={project.productionUrl} />
                </td>
                <td
                  className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-muted)]`}
                >
                  {formatDateTime(project.lastDeployedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 전체 개수는 페이지 정보(1–25 / 109)가 이미 말하므로, 한 장뿐일 때만 따로 밝힌다 */}
      <div className="mt-3">
        {pager.pageCount > 1 ? (
          <TablePager {...pager} />
        ) : (
          <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
            전체 {formatCount(projects.length)}개
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * 사이트 한 줄 설명 — 손으로 관리하는 표에 있는 사이트만 그린다
 *
 * @param name - Vercel 프로젝트 이름
 * @returns 설명 줄. 설명이 없으면 아무것도 그리지 않는다
 */
function SiteNote({ name }: { name: string }) {
  const note = SITE_NOTES[name]
  if (!note) return null

  return <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{note}</span>
}

/**
 * 프로덕션 도메인 링크
 *
 * @param url - 프로덕션 도메인. 프로토콜이 없으면 https를 붙인다
 */
function ProjectLink({ url }: { url: AxVercelProject['productionUrl'] }) {
  if (!url) return <span className="text-[var(--text-muted)]">—</span>

  const href = url.startsWith('http') ? url : `https://${url}`
  const label = url.replace(/^https?:\/\//, '')

  return (
    // 긴 도메인이 두 줄로 접히면 행 높이가 들쭉날쭉해지므로 한 줄로 자른다
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className="block truncate text-[var(--brand-primary)] underline-offset-4 transition-colors duration-200 hover:underline"
    >
      {label}
    </a>
  )
}

/**
 * 배포 상태 점 — 진행 중이면 깜빡인다
 *
 * @param state - 배포 상태 코드
 */
function StateDot({ state }: { state: AxVercelProject['lastDeploymentState'] }) {
  const tone = (state !== null ? STATE_DOTS[state] : null) ?? 'bg-[var(--text-muted)]'
  const pulse = state !== null && IN_FLIGHT_STATES.has(state) ? 'animate-pulse' : ''

  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone} ${pulse}`} />
}

/**
 * 배포 상태 표기 — 모르는 코드는 그대로 보여준다
 *
 * @param state - 배포 상태 코드
 * @returns 사람이 읽는 상태 이름. 상태가 없으면 빈 값 기호
 */
function stateLabel(state: AxVercelProject['lastDeploymentState']): string {
  if (state === null) return '—'
  return STATE_LABELS[state] ?? state
}
