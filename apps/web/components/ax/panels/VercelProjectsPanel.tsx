'use client'

/**
 * AX 대시보드 — 배포 사이트 패널 본문
 *
 * 화면 전체 폭을 쓰는 본문만 그린다. 제목·설명·출처는 껍데기가 그린다.
 * 확인이 필요한 상태부터, 같은 단계에서는 최근 배포 순으로 세운다. 행 수는 창 높이에 맞춘다.
 * 상태는 점으로 표시하고, 호버·키보드 포커스에서 이름을 보여준다.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AxVercelData, AxVercelProject } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDateTime } from '../format'
import { TablePager } from './TablePager'
import { TIP_BOX } from './primitives'

/** 제목 아래 남은 높이에 표와 페이지 이동을 맞춘다. */
const ROW_HEIGHT = 56
const HEADER_HEIGHT = 40
const FOOTER_SPACE = 88
const SCROLLBAR_SPACE = 16

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

/** 상태별 점 색 — 정상은 초록, 실패는 주황, 확인 필요는 황토색, 진행 중은 무채색 */
const STATE_DOTS: Record<string, string> = {
  READY: 'bg-[var(--accent-green)]',
  ERROR: 'bg-[var(--accent-orange)]',
  BLOCKED: 'bg-[var(--accent-orange)]',
  CANCELED: 'bg-amber-600',
}

/** 상태 코드를 사람이 읽는 말로 */
const STATE_LABELS: Record<string, string> = {
  READY: '정상',
  ERROR: '실패',
  BLOCKED: '차단됨',
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
const TD = 'py-2 px-3'

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

/** 확인 우선순위. 취소는 실패와 구분하고, 배포 정보가 없는 사이트도 먼저 확인한다. */
function statePriority(state: AxVercelProject['lastDeploymentState']): number {
  if (state === 'ERROR' || state === 'BLOCKED') return 0
  if (state !== null && IN_FLIGHT_STATES.has(state)) return 2
  if (state === 'READY') return 3
  return 1
}

/** 사이트 표 — 화면 높이에 맞춰 페이지를 나누고 마지막 장에도 같은 높이를 유지한다. */
function ProjectTable({ projects }: { projects: AxVercelProject[] }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [pageSize, setPageSize] = useState(10)
  // 행 번호를 기억하면 창 크기가 바뀌어도 보던 첫 항목이 새 페이지 안에 남는다.
  const [anchor, setAnchor] = useState(0)
  const sorted = useMemo(() => [...projects].sort((a, b) => {
    const priority = statePriority(a.lastDeploymentState) - statePriority(b.lastDeploymentState)
    const timestamp = (value: string | null) => value ? Date.parse(value) || 0 : 0
    return priority || timestamp(b.lastDeployedAt) - timestamp(a.lastDeployedAt)
  }), [projects])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      // 문서 기준 위치라 스크롤한 뒤 창 크기를 바꿔도 행 수가 갑자기 늘지 않는다.
      const top = list.getBoundingClientRect().top + window.scrollY
      const available = window.innerHeight - top - HEADER_HEIGHT - FOOTER_SPACE - SCROLLBAR_SPACE
      setPageSize(Math.max(3, Math.floor(available / ROW_HEIGHT)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(Math.floor(anchor / pageSize) + 1, pageCount)
  const start = (page - 1) * pageSize
  const shown = sorted.slice(start, start + pageSize)
  const pager = {
    page, pageCount, from: start + 1, to: start + shown.length, total: sorted.length,
    onChange: (next: number) => setAnchor((next - 1) * pageSize),
  }

  return (
    <div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        실패·차단 → 취소·정보 없음 → 진행 중 → 정상 · 같은 단계에서는 최근 배포순
      </p>
      <div
        ref={listRef}
        role="region"
        aria-label="배포 사이트 목록"
        tabIndex={0}
        style={{ height: HEADER_HEIGHT + Math.min(pageSize, projects.length) * ROW_HEIGHT + SCROLLBAR_SPACE }}
        className="overflow-auto focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]"
      >
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg-primary)]">
            <tr style={{ height: HEADER_HEIGHT }} className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH} w-16`}>상태</th>
              <th className={`text-left ${TD} ${TH} w-[26%]`}>사이트</th>
              <th className={`text-left ${TD} ${TH}`}>도메인</th>
              <th className={`text-right ${TD} ${TH} w-36`}>최근 배포</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {shown.map((project) => (
              <tr
                key={project.id}
                style={{ height: ROW_HEIGHT }}
                className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
              >
                <td className={TD}>
                  <StateDot state={project.lastDeploymentState} />
                </td>
                <td className={TD}>
                  {/* 사이트 이름은 사람 말이 아니라 식별자라 모노스페이스로 둔다 */}
                  <span title={project.name} className="block truncate font-mono text-sm text-[var(--text-primary)]">
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

      {/* 전체 개수는 페이지 정보가 이미 말하므로, 한 장뿐일 때만 따로 밝힌다 */}
      <div className="mt-3">
        {pager.pageCount > 1 ? (
          <TablePager {...pager} onChange={(page) => {
            pager.onChange(page)
            if (listRef.current) listRef.current.scrollTop = 0
          }} />
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

  return <span title={note} className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{note}</span>
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
  const tone = (state !== null ? STATE_DOTS[state] : null) ?? (state !== null && IN_FLIGHT_STATES.has(state) ? 'bg-[var(--text-muted)]' : 'bg-amber-600')
  const pulse = state !== null && IN_FLIGHT_STATES.has(state) ? 'animate-pulse' : ''

  const label = stateLabel(state)
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={`배포 상태: ${label}`}
      className="group relative flex size-6 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]"
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone} ${pulse}`} />
      <span aria-hidden className={`${TIP_BOX} absolute left-full top-1/2 z-20 ml-1 hidden -translate-y-1/2 whitespace-nowrap group-hover:block group-focus:block`}>
        {label}
      </span>
    </span>
  )
}

/**
 * 배포 상태 표기 — 모르는 코드는 그대로 보여준다
 *
 * @param state - 배포 상태 코드
 * @returns 사람이 읽는 상태 이름. 상태가 없으면 빈 값 기호
 */
function stateLabel(state: AxVercelProject['lastDeploymentState']): string {
  if (state === null) return '배포 정보 없음'
  return STATE_LABELS[state] ?? state
}
