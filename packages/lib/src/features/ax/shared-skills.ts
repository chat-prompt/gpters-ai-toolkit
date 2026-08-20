/**
 * AX Dashboard — 공유 스킬(bbopters-shared) 패널
 *
 * OpenClaw 등 사내 에이전트가 공용으로 불러 쓰는 별도 스킬 저장소의
 * 인벤토리를 GitHub API로 조회해 보여준다. AI Toolkit 카탈로그에 없다는 이유로
 * 사내 스킬 집계에서 빠지면 안 된다는 요구(DEV-4140)의 1단계 구현이다.
 *
 * 지금은 **인벤토리만** 연결돼 있다. 실행 이벤트 수집은 아직 계약이 없으므로
 * `eventsConnected: false`로 내려보내고 화면이 그 사실을 명시한다.
 * 수집 계약 설계는 docs/plans/ax-shared-skills.md 참고.
 */

import { db, catalogItems } from '@gpters/db'
import { and, eq, isNull, or } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelError, panelNotConfigured, panelOk } from './panel'
import type { AxPanel, AxPanelMeta, AxPanelResult, AxSharedSkillRow, AxSharedSkillsData } from './types'

const log = createLogger('ax-shared-skills')

const META: AxPanelMeta = {
  id: 'shared-skills',
  title: '에이전트 스킬',
  description: '사내 에이전트가 공용으로 쓰는 저장소(bbopters-shared)의 스킬 인벤토리',
  source: 'GitHub (bbopters-shared)',
  visibility: 'org',
  usesPeriod: false,
}

/** 캐시 TTL — 5분. 저장소 인벤토리는 분 단위로 바뀌지 않는다 */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * 커밋 통계가 아직 없을 때의 짧은 캐시 TTL — 1분
 *
 * GitHub 통계는 한동안 조회가 없으면 202(계산 중)로 응답한다. 그 null을 5분 내내
 * 캐시하면 잔디가 그 동안 말없이 사라진다 — 짧게 잡아 금방 자기 치유되게 한다.
 */
const CACHE_TTL_PENDING_MS = 60 * 1000

/**
 * 커밋 일별 시리즈의 별도 캐시 TTL — 1시간
 *
 * 이 저장소는 에이전트들이 상시 커밋해서(주 100건 이상) 푸시마다 GitHub 통계
 * 캐시가 무효화된다 → 통계 API가 202를 주는 일이 흔하다. 그때는 커밋 목록을
 * 직접 페이지네이션해 세는데(최대 수십 요청) 비싸므로 결과를 길게 들고 있는다.
 */
const COMMIT_SERIES_TTL_MS = 60 * 60 * 1000

/** 커밋 목록 폴백의 페이지 상한 — 100건/페이지 × 40 = 연 4,000커밋까지 */
const COMMIT_PAGES_MAX = 40

/** 커밋 시리즈 캐시 — 인벤토리 캐시(5분)와 수명이 달라 분리한다 */
let commitSeriesCache: {
  key: string
  daily: Array<{ date: string; events: number }>
  expiresAt: number
} | null = null

const FETCH_TIMEOUT_MS = 10_000

/** 저장소 안에서 스킬 디렉터리들이 사는 기본 경로 */
const DEFAULT_SKILLS_PATH = 'skills'

/** 캐시 — 설정(repo·경로)이 바뀌면 무효가 되도록 키를 함께 저장한다 */
let cache: { key: string; result: AxPanelResult<AxSharedSkillsData>; expiresAt: number } | null = null

/** GitHub git trees API 응답 (필요한 필드만) */
export interface GitTreeResponse {
  tree?: Array<{ path?: string; type?: string }>
  truncated?: boolean
}

/** 테스트에서 캐시를 초기화하기 위한 헬퍼 */
export function __resetSharedSkillsCache(): void {
  cache = null
  commitSeriesCache = null
}

/**
 * 공유 저장소 접속 설정 — 에이전트 스킬 계열 패널들이 같은 env 규칙을 쓴다
 *
 * @returns 설정이 갖춰졌으면 {repo, token, skillsPath}, 아니면 부족한 변수명
 */
export function resolveSharedRepoConfig():
  | { ok: true; repo: string; token: string; skillsPath: string }
  | { ok: false; missing: 'BBOPTERS_SHARED_REPO' | 'GH_TOKEN' } {
  const repo = (process.env.BBOPTERS_SHARED_REPO || '').trim()
  if (!repo) return { ok: false, missing: 'BBOPTERS_SHARED_REPO' }
  const token = process.env.GH_TOKEN
  if (!token) return { ok: false, missing: 'GH_TOKEN' }
  const rawPath = (process.env.BBOPTERS_SHARED_SKILLS_PATH || '').trim().replace(/^\/+|\/+$/g, '')
  return { ok: true, repo, token, skillsPath: rawPath || DEFAULT_SKILLS_PATH }
}

/**
 * aitk 카탈로그에 발행된 팀 스킬 id 집합
 *
 * 같은 id의 에이전트 스킬에 "aitk에도 있음"을 표시하기 위한 조회.
 * 실패해도 패널을 죽이지 않는다 — 겹침 판정만 포기하고 null을 돌려준다.
 */
async function fetchCatalogSkillIds(): Promise<Set<string> | null> {
  try {
    const rows = await db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.type, 'skill'),
          or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
        )
      )
    return new Set(rows.map((row) => row.id))
  } catch (error) {
    log.warn('aitk 카탈로그 조회 실패 — 겹침 표시 없이 계속한다', { error })
    return null
  }
}

/**
 * tree 항목에서 스킬 인벤토리를 추린다
 *
 * `{skillsPath}/{id}` 형태의 디렉터리 하나 = 스킬 하나로 본다.
 * SKILL.md 유무를 함께 표시해 규격 미준수 디렉터리를 화면에서 걸러볼 수 있게 한다.
 *
 * @param tree - git trees API의 tree 배열
 * @param skillsPath - 스킬 디렉터리들의 상위 경로
 * @returns 스킬 id 오름차순 인벤토리
 */
export function extractSkills(
  tree: Array<{ path?: string; type?: string }>,
  skillsPath: string
): Array<Omit<AxSharedSkillRow, 'inAitk'>> {
  const prefix = `${skillsPath}/`
  const dirs = new Set<string>()
  const withDoc = new Set<string>()

  for (const entry of tree) {
    const path = entry.path ?? ''
    if (!path.startsWith(prefix)) continue

    const rest = path.slice(prefix.length)
    const [id, ...remainder] = rest.split('/')
    if (!id) continue

    if (entry.type === 'tree' && remainder.length === 0) {
      dirs.add(id)
    }
    if (remainder.join('/') === 'SKILL.md') {
      dirs.add(id)
      withDoc.add(id)
    }
  }

  return Array.from(dirs)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, path: `${skillsPath}/${id}`, hasSkillDoc: withDoc.has(id) }))
}

/** GitHub 주간 커밋 통계 한 줄 (필요한 필드만) */
interface CommitActivityWeek {
  /** 주 시작(일요일, UTC) unix 초 */
  week?: number
  /** 일~토 요일별 커밋 수 */
  days?: number[]
}

/**
 * 저장소의 최근 52주 일별 커밋 수 — 에이전트 활동 잔디밭용
 *
 * GitHub 통계 API는 첫 호출에 202(계산 중)를 줄 수 있다. 그때는 null을 돌려주고
 * 다음 캐시 갱신 때 채워진다 — 잔디를 0으로 꾸미지 않는다.
 *
 * @param repo - "owner/repo"
 * @param token - GitHub 토큰
 * @returns 일별 커밋 시리즈 (오늘 이후 날짜는 제외). 미준비·실패면 null
 */
async function fetchCommitActivity(
  repo: string,
  token: string
): Promise<Array<{ date: string; events: number }> | null> {
  if (commitSeriesCache && commitSeriesCache.key === repo && commitSeriesCache.expiresAt > Date.now()) {
    return commitSeriesCache.daily
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }

  try {
    // 1차: 통계 API — 데워져 있으면 요청 한 번으로 끝난다
    const res = await fetch(`https://api.github.com/repos/${repo}/stats/commit_activity`, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    let daily: Array<{ date: string; events: number }> | null = null
    if (res.ok && res.status !== 202) {
      daily = parseCommitWeeks((await res.json()) as CommitActivityWeek[])
    }

    // 2차: 커밋 목록 직접 집계 — 이 저장소는 푸시가 잦아 통계가 202(계산 중)인 일이 흔하다
    if (daily === null) {
      daily = await countCommitsDaily(repo, headers)
    }

    if (daily !== null) {
      commitSeriesCache = { key: repo, daily, expiresAt: Date.now() + COMMIT_SERIES_TTL_MS }
    }
    return daily
  } catch (error) {
    log.warn('커밋 통계 조회 실패 — 에이전트 활동 잔디 없이 계속한다', { error })
    return null
  }
}

/**
 * 커밋 목록을 페이지네이션해 일별로 센다 (통계 API 폴백)
 *
 * @param repo - "owner/repo"
 * @param headers - 인증 헤더
 * @returns 최근 52주 일별 커밋 시리즈. 실패·초과면 null
 */
async function countCommitsDaily(
  repo: string,
  headers: Record<string, string>
): Promise<Array<{ date: string; events: number }> | null> {
  const since = new Date(Date.now() - 52 * 7 * 24 * 60 * 60 * 1000)
  const counts = new Map<string, number>()

  for (let page = 1; page <= COMMIT_PAGES_MAX; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?since=${since.toISOString()}&per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!res.ok) return null

    const commits = (await res.json()) as Array<{ commit?: { committer?: { date?: string } } }>
    if (!Array.isArray(commits)) return null

    for (const item of commits) {
      const date = item.commit?.committer?.date?.slice(0, 10)
      if (date) counts.set(date, (counts.get(date) ?? 0) + 1)
    }
    if (commits.length < 100) break
    if (page === COMMIT_PAGES_MAX) {
      // 상한에 걸리면 오래된 구간이 빠진 채 그럴듯하게 보일 수 있다 — 그리지 않는 쪽을 택한다
      log.warn('커밋 목록이 조회 상한을 넘어 잔디를 생략한다', { repo })
      return null
    }
  }

  if (counts.size === 0) return null

  // 활동 없는 날을 0으로 채워 52주 연속 축을 만든다 (UTC 날짜)
  const daily: Array<{ date: string; events: number }> = []
  const today = new Date().toISOString().slice(0, 10)
  for (let time = since.getTime(); ; time += 24 * 60 * 60 * 1000) {
    const date = new Date(time).toISOString().slice(0, 10)
    if (date > today) break
    daily.push({ date, events: counts.get(date) ?? 0 })
  }
  return daily
}

/**
 * 주간 통계 배열을 일별 시리즈로 펼친다 (오늘 이후 날짜 제외)
 *
 * @param weeks - GitHub 주간 커밋 통계
 * @returns 일별 커밋 시리즈. 비어 있으면 null
 */
function parseCommitWeeks(
  weeks: CommitActivityWeek[]
): Array<{ date: string; events: number }> | null {
  if (!Array.isArray(weeks) || weeks.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)
  const daily: Array<{ date: string; events: number }> = []
  for (const entry of weeks) {
    if (typeof entry.week !== 'number' || !Array.isArray(entry.days)) continue
    for (let day = 0; day < entry.days.length; day++) {
      const date = new Date((entry.week + day * 86_400) * 1000).toISOString().slice(0, 10)
      if (date > today) continue
      daily.push({ date, events: Number(entry.days[day]) || 0 })
    }
  }
  return daily.length > 0 ? daily : null
}

/**
 * 저장소 전체 트리를 한 번에 가져온다
 *
 * 디렉터리마다 contents API를 부르면 스킬 수만큼 요청이 나가므로
 * recursive tree 요청 하나로 끝낸다.
 *
 * @param repo - "owner/repo"
 * @param token - GitHub 토큰
 * @returns tree 배열과 잘림 여부
 */
export async function fetchRepoTree(repo: string, token: string): Promise<GitTreeResponse> {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`GitHub API 응답 오류 (status ${res.status})`)
  }

  return (await res.json()) as GitTreeResponse
}

/** 공유 스킬 패널 */
export const sharedSkillsPanel: AxPanel<AxSharedSkillsData> = {
  meta: META,
  async load(): Promise<AxPanelResult<AxSharedSkillsData>> {
    const repo = (process.env.BBOPTERS_SHARED_REPO || '').trim()
    if (!repo) {
      return panelNotConfigured(
        META,
        'BBOPTERS_SHARED_REPO 환경변수(owner/repo)가 설정되지 않았습니다'
      )
    }

    const token = process.env.GH_TOKEN
    if (!token) {
      return panelNotConfigured(META, 'GH_TOKEN 환경변수가 설정되지 않았습니다')
    }

    // "skills/" 같은 흔한 표기가 prefix "skills//"가 되어 빈 목록으로 새지 않게 정규화한다
    const rawPath = (process.env.BBOPTERS_SHARED_SKILLS_PATH || '').trim().replace(/^\/+|\/+$/g, '')
    const skillsPath = rawPath || DEFAULT_SKILLS_PATH

    const cacheKey = `${repo}|${skillsPath}`
    if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) {
      return cache.result
    }

    try {
      const body = await fetchRepoTree(repo, token)
      const inventory = extractSkills(body.tree ?? [], skillsPath)
      const truncated = body.truncated === true

      if (truncated) {
        // 목록이 잘렸는데 조용히 넘어가면 "전부 다 있다"로 읽힌다
        log.warn('에이전트 스킬 저장소 트리가 잘려 일부만 표시된다', { repo, shown: inventory.length })
      }

      // 팀 스킬(aitk)과 id가 겹치는 항목을 표시만 한다 — 수치 합산은 하지 않는다
      const catalogIds = await fetchCatalogSkillIds()
      const skills: AxSharedSkillRow[] = inventory.map((skill) => ({
        ...skill,
        inAitk: catalogIds !== null && catalogIds.has(skill.id),
      }))
      const aitkOverlap =
        catalogIds === null ? null : skills.filter((skill) => skill.inAitk).length

      // 에이전트 활동 잔디 — 실행 이벤트가 붙기 전까지의 프록시(저장소 커밋)
      const commitDaily = await fetchCommitActivity(repo, token)

      const result = panelOk(
        META,
        { repo, skills, aitkOverlap, commitDaily, eventsConnected: false, truncated },
        [{ label: '에이전트 스킬', value: skills.length.toLocaleString('ko-KR'), hint: '개' }]
      )
      cache = {
        key: cacheKey,
        result,
        // 커밋 통계가 아직 없으면 짧게 캐시해 금방 다시 시도한다
        expiresAt: Date.now() + (commitDaily === null ? CACHE_TTL_PENDING_MS : CACHE_TTL_MS),
      }

      return result
    } catch (error) {
      log.error('에이전트 스킬 인벤토리 조회 실패', error, { repo })
      return panelError(META, '에이전트 스킬 저장소를 조회하지 못했습니다')
    }
  },
}
