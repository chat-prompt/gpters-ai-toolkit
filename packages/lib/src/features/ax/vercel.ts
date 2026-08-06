/**
 * AX Dashboard — Vercel 배포 사이트 패널
 *
 * Vercel REST API(GET /v9/projects)로 팀의 프로젝트 목록을 조회해
 * 프로덕션 도메인·최근 배포 상태를 보여준다.
 */

import { createLogger } from '../../core/logger'
import { panelError, panelNotConfigured, panelOk } from './panel'
import type { AxPanel, AxPanelMeta, AxPanelResult, AxVercelData, AxVercelProject } from './types'

const log = createLogger('ax-vercel')

const META: AxPanelMeta = {
  id: 'vercel-deployments',
  title: '배포 사이트',
  description: '사내에서 배포해 운영 중인 사이트와 최신 배포 상태',
  source: 'Vercel API',
  visibility: 'org',
  usesPeriod: false,
}

/** 캐시 TTL — 5분 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** 한 번에 넘길 수 있는 최대 페이지 수 (무한 루프 방지) */
const MAX_PAGES = 5

const FETCH_TIMEOUT_MS = 10_000

let cache: { result: AxPanelResult<AxVercelData>; expiresAt: number } | null = null

/** Vercel API가 내려주는 프로젝트 원본 형태 (필요한 필드만) */
interface VercelProjectResponse {
  id: string
  name: string
  framework?: string | null
  latestDeployments?: Array<{ createdAt?: number }>
  targets?: {
    production?: {
      alias?: string[]
      url?: string
      createdAt?: number
      readyState?: string
    }
  }
}

interface VercelProjectsResponse {
  projects: VercelProjectResponse[]
  pagination?: { next?: number | string | null }
}

/** epoch ms를 ISO 8601 문자열로. 값이 없으면 null */
function toIso(epochMs: number | undefined | null): string | null {
  if (epochMs === undefined || epochMs === null) return null
  return new Date(epochMs).toISOString()
}

/** Vercel 프로젝트 원본을 패널 데이터 형태로 매핑 */
function mapProject(project: VercelProjectResponse): AxVercelProject {
  const production = project.targets?.production

  // alias 순서는 보장되지 않는다. 자동 생성 도메인보다 커스텀 도메인을 먼저 고른다
  const aliases = production?.alias ?? []
  const custom = aliases.find((alias) => !alias.endsWith('.vercel.app'))
  const productionUrl = custom ?? aliases[0] ?? production?.url ?? null

  const lastDeployedAt = toIso(production?.createdAt) ?? toIso(project.latestDeployments?.[0]?.createdAt)

  return {
    id: project.id,
    name: project.name,
    framework: project.framework ?? null,
    productionUrl,
    lastDeployedAt,
    lastDeploymentState: production?.readyState ?? null,
  }
}

/** 모든 페이지의 프로젝트를 가져온다 (최대 MAX_PAGES 페이지) */
async function fetchAllProjects(token: string, teamId: string | undefined): Promise<VercelProjectResponse[]> {
  const projects: VercelProjectResponse[] = []
  let until: number | string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL('https://api.vercel.com/v9/projects')
    url.searchParams.set('limit', '100')
    if (teamId) url.searchParams.set('teamId', teamId)
    if (until !== undefined) url.searchParams.set('until', String(until))

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!res.ok) {
      throw new Error(`Vercel API 응답 오류 (status ${res.status})`)
    }

    const body = (await res.json()) as VercelProjectsResponse
    projects.push(...body.projects)

    const next = body.pagination?.next
    if (!next) break
    until = next

    // 상한에 걸려 조용히 잘리는 상황을 로그로 남긴다
    if (page === MAX_PAGES - 1) {
      log.warn('Vercel 프로젝트가 조회 상한을 넘어 일부만 표시된다', { fetched: projects.length })
    }
  }

  return projects
}

/** 테스트에서 캐시를 초기화하기 위한 헬퍼 */
export function __resetVercelCache(): void {
  cache = null
}

/** Vercel 배포 사이트 패널 */
export const vercelDeploymentsPanel: AxPanel<AxVercelData> = {
  meta: META,
  async load(): Promise<AxPanelResult<AxVercelData>> {
    const token = process.env.VERCEL_API_TOKEN
    if (!token) {
      return panelNotConfigured(META, 'VERCEL_API_TOKEN 환경변수가 설정되지 않았습니다')
    }

    const teamId = process.env.VERCEL_TEAM_ID || undefined

    if (cache && cache.expiresAt > Date.now()) {
      return cache.result
    }

    try {
      const rawProjects = await fetchAllProjects(token, teamId)

      const projects = rawProjects
        .map(mapProject)
        .sort((a, b) => {
          // 배포 이력이 없는 프로젝트끼리는 이름순 — 비교자가 일관돼야 순서가 흔들리지 않는다
          if (a.lastDeployedAt === null && b.lastDeployedAt === null) return a.name.localeCompare(b.name)
          if (a.lastDeployedAt === null) return 1
          if (b.lastDeployedAt === null) return -1
          return b.lastDeployedAt.localeCompare(a.lastDeployedAt)
        })

      // 캐시에는 결과 전체를 담는다 — 조회 시각까지 함께 보존해야
      // 5분 된 데이터가 화면에서 "방금"으로 표시되지 않는다
      const result = panelOk(META, { team: teamId ?? null, projects }, [
        { label: '운영 사이트', value: projects.length.toLocaleString('ko-KR'), hint: '개' },
      ])
      cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }

      return result
    } catch (error) {
      log.error('Vercel 프로젝트 조회 실패', error)
      return panelError(META, 'Vercel API 조회에 실패했습니다')
    }
  },
}
