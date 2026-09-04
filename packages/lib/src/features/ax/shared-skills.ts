/**
 * AX Dashboard — 공유 스킬(bbopters-shared) 패널
 *
 * OpenClaw 등 사내 에이전트가 공용으로 불러 쓰는 별도 스킬 저장소의
 * 인벤토리를 GitHub API로 조회해 보여준다. AI Toolkit 카탈로그에 없다는 이유로
 * 사내 스킬 집계에서 빠지면 안 된다는 요구(DEV-4140)의 1단계 구현이다.
 *
 * 인벤토리에 **에이전트 스킬 로드 실측**을 붙인다(DEV-4221). 로드는 각 호스트의 텔레메트리
 * 수집기가 보낸 배치(`ax_agent_telemetry_batches.skill_loads`)에서 오며, 에이전트가 서버로
 * 이벤트를 직접 쓰는 별도 경로는 만들지 않았다.
 *
 * 스킬 신호를 관측할 수 있는 수집기의 배치가 하나도 없으면 `eventsConnected: false`로 내려보내
 * 화면이 0 대신 "미관측"을 적게 한다.
 * 수집 계약 설계는 docs/plans/ax-shared-skills.md 참고.
 */

import { db, catalogItems, axAgentTelemetryBatches } from '@gpters/db'
import { and, eq, gte, isNull, or } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelError, panelNotConfigured, panelOk } from './panel'
import { batchObservesSkills } from './agent-activity'
import type {
  AxAgentTelemetrySource,
  AxPanel,
  AxPanelMeta,
  AxPanelResult,
  AxSharedSkillRow,
  AxSharedSkillsData,
} from './types'

const log = createLogger('ax-shared-skills')

const META: AxPanelMeta = {
  id: 'shared-skills',
  title: '보유 스킬',
  description: '사내 에이전트가 공용으로 쓰는 저장소(bbopters-shared)의 스킬 인벤토리',
  source: 'GitHub (bbopters-shared)',
  visibility: 'org',
  parentId: 'skill-usage',
  usesPeriod: false,
}

/** 캐시 TTL — 5분. 저장소 인벤토리는 분 단위로 바뀌지 않는다 */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * 에이전트 스킬 로드 집계 창(일)
 *
 * 이 패널은 상단 기간 필터를 쓰지 않는 스냅숏이라 창을 코드에 고정하고 화면이 그 값을 적는다.
 * 30일은 수집기 두 대의 현재 표본에서 스킬별 로드가 한 자릿수를 넘는 최소 구간이다.
 */
const USAGE_WINDOW_DAYS = 30

/** 저장소 밖 로드 목록에 내려보내는 최대 줄 수 — 화면에서 판단에 쓰는 만큼만 */
const UNMATCHED_LIMIT = 15

/** 배치가 담고 있는 수집 소스 값 */
const TELEMETRY_SOURCES: readonly AxAgentTelemetrySource[] = ['openclaw', 'claude-code', 'codex', 'hermes']

/**
 * 수집기가 보낸 스킬 ID를 저장소 디렉터리 이름에 맞춘다.
 *
 * 에이전트 런타임은 `openclaw-skills:session-cleanup`처럼 플러그인 네임스페이스를 붙여 보고하는데
 * 저장소 인벤토리는 디렉터리 이름뿐이다. 마지막 `:` 뒤 조각으로 맞추되, 이렇게 이어진 항목은
 * 같은 이름의 다른 스킬일 수 있으므로 화면에서 이름 매칭임을 밝힌다.
 *
 * @param raw - 배치의 `skillLoads[].skillId`
 * @returns 네임스페이스를 뗀 이름
 */
export function normalizeSharedSkillId(raw: string): string {
  const tail = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw
  return tail.trim()
}

/** 스킬 하나에 대한 에이전트 로드 집계 */
interface SkillUsage {
  loads: number
  agents: Set<string>
  /** 마지막 로드가 담긴 수집 창의 끝 (epoch ms) */
  lastAt: number
  /** 네임스페이스를 뗀 이름으로 맞춘 로드가 섞여 있는지 */
  byName: boolean
}

/** 텔레메트리 배치에서 모은 스킬 로드 */
interface AgentSkillLoads {
  /** 스킬 신호를 관측할 수 있는 배치가 하나라도 있었는지 */
  observed: boolean
  /** 그 배치를 보낸 에이전트 수 */
  agents: number
  /** 정규화한 스킬 이름 → 집계 */
  byName: Map<string, SkillUsage>
  /** 원본 skillId → 로드 수 (저장소 밖 판정에 쓴다) */
  rawLoads: Map<string, number>
}

/**
 * 최근 창의 에이전트 스킬 로드를 모은다.
 *
 * 한 배치는 내부 시간 분포를 보존하지 않는 집계 단위라, 기간 경계에 걸친 배치는 에이전트 활동
 * 패널과 같은 규칙으로 통째로 제외한다(부분 배분은 사용량이 균등했다는 거짓 가정이다).
 *
 * 실패해도 패널을 죽이지 않는다 — 인벤토리는 그대로 쓸모가 있으므로 사용량만 포기한다.
 * 구형 DB에 테이블이 없는 경우도 같은 경로다.
 *
 * @returns 조회하지 못했으면 null — 그때는 사용량을 0이 아니라 미관측으로 둔다
 */
async function loadAgentSkillLoads(): Promise<AgentSkillLoads | null> {
  const cutoff = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000)
  let rows: Array<typeof axAgentTelemetryBatches.$inferSelect>
  try {
    rows = await db.select().from(axAgentTelemetryBatches)
      .where(gte(axAgentTelemetryBatches.windowEnd, cutoff))
  } catch (error) {
    log.warn('에이전트 스킬 로드 조회 실패 — 사용량 없이 인벤토리만 보여준다', { error })
    return null
  }

  const result: AgentSkillLoads = { observed: false, agents: 0, byName: new Map(), rawLoads: new Map() }
  const agents = new Set<string>()

  for (const row of rows) {
    if (new Date(row.windowStart).getTime() < cutoff.getTime()) continue

    const collection = row.collection as Record<string, unknown> | null
    const sourceValue = collection && typeof collection.source === 'string' ? collection.source : ''
    if (!TELEMETRY_SOURCES.includes(sourceValue as AxAgentTelemetrySource)) continue
    const source = sourceValue as AxAgentTelemetrySource
    if (!batchObservesSkills(source, row.runtime)) continue

    result.observed = true
    agents.add(row.agentId)
    const windowEnd = new Date(row.windowEnd).getTime()

    for (const raw of row.skillLoads ?? []) {
      const skillId = typeof raw.skillId === 'string' ? raw.skillId : ''
      const loaded = Number(raw.loaded)
      if (!skillId || !Number.isFinite(loaded) || loaded <= 0) continue

      result.rawLoads.set(skillId, (result.rawLoads.get(skillId) ?? 0) + loaded)

      const name = normalizeSharedSkillId(skillId)
      if (!name) continue
      const usage = result.byName.get(name) ?? { loads: 0, agents: new Set<string>(), lastAt: 0, byName: false }
      usage.loads += loaded
      usage.agents.add(row.agentId)
      usage.lastAt = Math.max(usage.lastAt, windowEnd)
      if (name !== skillId) usage.byName = true
      result.byName.set(name, usage)
    }
  }

  result.agents = agents.size
  return result
}

/**
 * 커밋 일별 시리즈의 별도 캐시 TTL — 1시간
 *
 * 이 저장소는 에이전트들이 상시 커밋해서(주 100건 이상) 푸시마다 GitHub 통계
 * 캐시가 무효화된다 → 통계 API가 202를 주는 일이 흔하다. 그때는 커밋 목록을
 * 직접 페이지네이션해 세는데(최대 수십 요청) 비싸므로 결과를 길게 들고 있는다.
 */
const COMMIT_SERIES_TTL_MS = 60 * 60 * 1000

/** 커밋 목록 폴백의 페이지 상한 — 100건/페이지 × 60 = 연 6,000커밋까지 (현재 연 ~5,200 페이스) */
const COMMIT_PAGES_MAX = 60

/** 잔디 고정 창 — 오늘을 포함한 최근 365일, UTC 날짜 기준 */
const COMMIT_WINDOW_DAYS = 365

/** 하루의 밀리초 */
const DAY_MS = 24 * 60 * 60 * 1000

/** 통계 API와 커밋 목록 폴백이 공유하는 반열린 날짜 창 */
interface CommitWindow {
  /** UTC 자정, 포함 */
  startMs: number
  /** UTC 자정, 미포함 */
  endExclusiveMs: number
  startDate: string
  endDate: string
}

/**
 * 커밋 시리즈 캐시 — 인벤토리 캐시(5분)와 수명이 달라 분리한다.
 * 실패(null)도 캐시한다 — 안 하면 통계 202 + 폴백 실패 조합에서 워밍된 인스턴스가
 * 1분마다 수십 건의 GitHub 요청을 반복한다.
 */
let commitSeriesCache: {
  key: string
  daily: Array<{ date: string; events: number }> | null
  expiresAt: number
} | null = null

const FETCH_TIMEOUT_MS = 10_000

/** 저장소 안에서 스킬 디렉터리들이 사는 기본 경로 */
const DEFAULT_SKILLS_PATH = 'skills'

/** 캐시 — 설정(repo·경로)이 바뀌면 무효가 되도록 키를 함께 저장한다 */
let cache: { key: string; result: AxPanelResult<AxSharedSkillsData>; expiresAt: number } | null = null

/** GitHub git trees API 응답 (필요한 필드만) */
export interface GitTreeResponse {
  sha?: string
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
  // 인벤토리 조회는 저장소만 본다. 겹침·사용량은 load()가 따로 붙인다
): Array<Pick<AxSharedSkillRow, 'id' | 'path' | 'hasSkillDoc'>> {
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
 * 기준 시각에서 오늘을 포함한 365일짜리 UTC 날짜 창을 만든다
 *
 * @param now - 기준 시각
 * @returns `[start, endExclusive)` 고정 창
 */
function commitWindow(now: Date): CommitWindow {
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const startMs = todayMs - (COMMIT_WINDOW_DAYS - 1) * DAY_MS
  const endExclusiveMs = todayMs + DAY_MS
  return {
    startMs,
    endExclusiveMs,
    startDate: new Date(startMs).toISOString().slice(0, 10),
    endDate: new Date(todayMs).toISOString().slice(0, 10),
  }
}

/**
 * 경로별 원시 집계를 같은 365일 축으로 자르고 빈 날을 0으로 채운다
 *
 * @param counts - UTC 날짜별 커밋 수
 * @param window - 정규화할 날짜 창
 * @returns 정확히 365칸인 일별 시리즈
 */
function fillCommitWindow(
  counts: Map<string, number>,
  window: CommitWindow
): Array<{ date: string; events: number }> {
  const daily: Array<{ date: string; events: number }> = []
  for (let time = window.startMs; time < window.endExclusiveMs; time += DAY_MS) {
    const date = new Date(time).toISOString().slice(0, 10)
    daily.push({ date, events: counts.get(date) ?? 0 })
  }
  return daily
}

/**
 * 저장소의 최근 365일 일별 커밋 수 — 에이전트 활동 잔디밭용
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
  const remember = (daily: Array<{ date: string; events: number }> | null) => {
    commitSeriesCache = { key: repo, daily, expiresAt: Date.now() + COMMIT_SERIES_TTL_MS }
    return daily
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
  // 두 조회 경로가 네트워크 대기 중 날짜 경계를 넘더라도 같은 창을 쓰게 한 번만 고정한다.
  const window = commitWindow(new Date())

  try {
    // 1차: 통계 API — 데워져 있으면 요청 한 번으로 끝난다
    const res = await fetch(`https://api.github.com/repos/${repo}/stats/commit_activity`, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    let daily: Array<{ date: string; events: number }> | null = null
    if (res.ok && res.status !== 202) {
      daily = parseCommitWeeks((await res.json()) as CommitActivityWeek[], window)
    }

    // 2차: 커밋 목록 직접 집계 — 이 저장소는 푸시가 잦아 통계가 202(계산 중)인 일이 흔하다
    if (daily === null) {
      daily = await countCommitsDaily(repo, headers, window)
    }

    return remember(daily)
  } catch (error) {
    log.warn('커밋 통계 조회 실패 — 에이전트 활동 잔디 없이 계속한다', { error })
    return remember(null)
  }
}

/**
 * 커밋 목록을 페이지네이션해 일별로 센다 (통계 API 폴백)
 *
 * @param repo - "owner/repo"
 * @param headers - 인증 헤더
 * @returns 최근 365일 일별 커밋 시리즈. 실패·초과면 null
 */
async function countCommitsDaily(
  repo: string,
  headers: Record<string, string>,
  window: CommitWindow
): Promise<Array<{ date: string; events: number }> | null> {
  const counts = new Map<string, number>()
  const since = new Date(window.startMs).toISOString()
  const until = new Date(window.endExclusiveMs - 1).toISOString()

  for (let page = 1; page <= COMMIT_PAGES_MAX; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?since=${since}&until=${until}&per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!res.ok) return null

    const commits = (await res.json()) as Array<{ commit?: { committer?: { date?: string } } }>
    if (!Array.isArray(commits)) return null

    for (const item of commits) {
      const date = item.commit?.committer?.date?.slice(0, 10)
      // GitHub의 since/until 경계 해석에 기대지 않고 같은 반열린 창으로 한 번 더 자른다.
      if (date && date >= window.startDate && date <= window.endDate) {
        counts.set(date, (counts.get(date) ?? 0) + 1)
      }
    }
    if (commits.length < 100) break
    if (page === COMMIT_PAGES_MAX) {
      // 상한에 걸리면 오래된 구간이 빠진 채 그럴듯하게 보일 수 있다 — 그리지 않는 쪽을 택한다
      log.warn('커밋 목록이 조회 상한을 넘어 잔디를 생략한다', { repo })
      return null
    }
  }

  if (counts.size === 0) return null

  return fillCommitWindow(counts, window)
}

/**
 * 주간 통계 배열을 일별 시리즈로 펼친다 (오늘 이후 날짜 제외)
 *
 * @param weeks - GitHub 주간 커밋 통계
 * @returns 일별 커밋 시리즈. 비어 있으면 null
 */
function parseCommitWeeks(
  weeks: CommitActivityWeek[],
  window: CommitWindow
): Array<{ date: string; events: number }> | null {
  if (!Array.isArray(weeks) || weeks.length === 0) return null

  const counts = new Map<string, number>()
  let hasDateInWindow = false
  for (const entry of weeks) {
    if (typeof entry.week !== 'number' || !Array.isArray(entry.days)) continue
    for (let day = 0; day < entry.days.length; day++) {
      const date = new Date((entry.week + day * 86_400) * 1000).toISOString().slice(0, 10)
      if (date < window.startDate || date > window.endDate) continue
      hasDateInWindow = true
      counts.set(date, Number(entry.days[day]) || 0)
    }
  }
  return hasDateInWindow ? fillCommitWindow(counts, window) : null
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
export async function fetchRepoTree(repo: string, token: string, ref = 'HEAD'): Promise<GitTreeResponse> {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, {
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

      // 팀 스킬(aitk) 겹침과 에이전트 로드는 서로 독립이라 동시에 조회한다
      const [catalogIds, usage] = await Promise.all([
        fetchCatalogSkillIds(),
        loadAgentSkillLoads(),
      ])
      const observed = usage?.observed === true

      const skills: AxSharedSkillRow[] = inventory.map((skill) => {
        const hit = usage?.byName.get(skill.id)
        return {
          ...skill,
          inAitk: catalogIds !== null && catalogIds.has(skill.id),
          // 관측 자체가 없으면 0이 아니라 null — 화면이 "미관측"으로 적는다
          agentLoads: observed ? (hit?.loads ?? 0) : null,
          agentCount: hit?.agents.size ?? 0,
          lastLoadedAt: hit && hit.lastAt > 0 ? new Date(hit.lastAt).toISOString() : null,
          matchedByName: hit?.byName === true,
        }
      })
      const aitkOverlap =
        catalogIds === null ? null : skills.filter((skill) => skill.inAitk).length

      // 저장소 밖 로드 — 감추면 저장소 스킬의 0이 계측 누락처럼 읽힌다
      const inventoryIds = new Set(inventory.map((skill) => skill.id))
      const unmatchedLoads = observed
        ? [...(usage?.rawLoads ?? new Map<string, number>())]
            .filter(([id]) => !inventoryIds.has(normalizeSharedSkillId(id)))
            .map(([id, loads]) => ({ id, loads }))
            .sort((a, b) => b.loads - a.loads || a.id.localeCompare(b.id))
        : []
      const totalObservedLoads = observed
        ? [...(usage?.rawLoads.values() ?? [])].reduce((sum, loads) => sum + loads, 0)
        : 0
      const matchedLoads = totalObservedLoads - unmatchedLoads.reduce((sum, row) => sum + row.loads, 0)

      // 에이전트 활동 잔디 — 저장소 커밋 리듬(스킬 실행 횟수가 아니다)
      const commitDaily = await fetchCommitActivity(repo, token)

      const result = panelOk(
        META,
        {
          repo,
          skills,
          aitkOverlap,
          commitDaily,
          eventsConnected: observed,
          usageWindowDays: USAGE_WINDOW_DAYS,
          observedAgents: usage?.agents ?? 0,
          matchedLoads,
          totalObservedLoads,
          unmatchedLoads: unmatchedLoads.slice(0, UNMATCHED_LIMIT),
          truncated,
        },
        [{ label: '에이전트 스킬', value: skills.length.toLocaleString('ko-KR'), hint: '개' }]
      )
      // 커밋 시리즈 실패는 시리즈 캐시가 1시간 부정 캐시로 관리한다 — 패널 캐시는 단순하게 둔다
      cache = { key: cacheKey, result, expiresAt: Date.now() + CACHE_TTL_MS }

      return result
    } catch (error) {
      log.error('에이전트 스킬 인벤토리 조회 실패', error, { repo })
      return panelError(META, '에이전트 스킬 저장소를 조회하지 못했습니다')
    }
  },
}
