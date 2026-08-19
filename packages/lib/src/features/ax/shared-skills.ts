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

import { createLogger } from '../../core/logger'
import { panelError, panelNotConfigured, panelOk } from './panel'
import type { AxPanel, AxPanelMeta, AxPanelResult, AxSharedSkillRow, AxSharedSkillsData } from './types'

const log = createLogger('ax-shared-skills')

const META: AxPanelMeta = {
  id: 'shared-skills',
  title: '공유 스킬',
  description: '사내 에이전트가 공용으로 쓰는 공유 저장소의 스킬 인벤토리',
  source: 'GitHub (bbopters-shared)',
  visibility: 'org',
  usesPeriod: false,
}

/** 캐시 TTL — 5분. 저장소 인벤토리는 분 단위로 바뀌지 않는다 */
const CACHE_TTL_MS = 5 * 60 * 1000

const FETCH_TIMEOUT_MS = 10_000

/** 저장소 안에서 스킬 디렉터리들이 사는 기본 경로 */
const DEFAULT_SKILLS_PATH = 'skills'

/** 캐시 — 설정(repo·경로)이 바뀌면 무효가 되도록 키를 함께 저장한다 */
let cache: { key: string; result: AxPanelResult<AxSharedSkillsData>; expiresAt: number } | null = null

/** GitHub git trees API 응답 (필요한 필드만) */
interface GitTreeResponse {
  tree?: Array<{ path?: string; type?: string }>
  truncated?: boolean
}

/** 테스트에서 캐시를 초기화하기 위한 헬퍼 */
export function __resetSharedSkillsCache(): void {
  cache = null
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
function extractSkills(
  tree: Array<{ path?: string; type?: string }>,
  skillsPath: string
): AxSharedSkillRow[] {
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
async function fetchRepoTree(repo: string, token: string): Promise<GitTreeResponse> {
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
      const skills = extractSkills(body.tree ?? [], skillsPath)
      const truncated = body.truncated === true

      if (truncated) {
        // 목록이 잘렸는데 조용히 넘어가면 "전부 다 있다"로 읽힌다
        log.warn('공유 스킬 저장소 트리가 잘려 일부만 표시된다', { repo, shown: skills.length })
      }

      const result = panelOk(
        META,
        { repo, skills, eventsConnected: false, truncated },
        [{ label: '공유 스킬', value: skills.length.toLocaleString('ko-KR'), hint: '개' }]
      )
      cache = { key: cacheKey, result, expiresAt: Date.now() + CACHE_TTL_MS }

      return result
    } catch (error) {
      log.error('공유 스킬 인벤토리 조회 실패', error, { repo })
      return panelError(META, '공유 스킬 저장소를 조회하지 못했습니다')
    }
  },
}
