/**
 * AX Dashboard — 스킬 비교 패널
 *
 * 팀 스킬(aitk 카탈로그)과 에이전트 스킬(bbopters-shared)을 이름·내용으로 대조한다.
 * 실측 결과 같은 id라도 내용이 사실상 다른 "동명이인 스킬"이 절반 가까이라,
 * 이 패널이 그 현황을 상시 보여준다 — 두 소스를 자동으로 합치지 않는 근거이기도 하다.
 *
 * 비용이 큰 조회(에이전트 SKILL.md 전체)라 캐시를 1시간으로 길게 잡는다.
 */

import { createHash } from 'node:crypto'
import { db, catalogItems } from '@gpters/db'
import { and, eq, isNull, or } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelError, panelNotConfigured, panelOk } from './panel'
import { extractSkills, fetchRepoTree, resolveSharedRepoConfig } from './shared-skills'
import type { AxPanel, AxPanelMeta, AxPanelResult, AxSkillDiffData, AxSkillDiffRow } from './types'

const log = createLogger('ax-skill-diff')

const META: AxPanelMeta = {
  id: 'skill-diff',
  title: '팀 스킬과 비교',
  description: '팀 스킬(aitk)과 에이전트 스킬(bbopters-shared)의 이름·내용 대조',
  source: 'aitk DB + GitHub (bbopters-shared)',
  visibility: 'org',
  parentId: 'skill-usage',
  usesPeriod: false,
}

/**
 * 캐시 TTL — 1시간
 *
 * 이 패널은 에이전트 스킬 문서 전체를 내려받아 비교하므로 다른 패널보다 훨씬 무겁다.
 * 스킬 내용은 분 단위로 바뀌지 않으니 길게 캐시한다.
 */
const CACHE_TTL_MS = 60 * 60 * 1000

/** SKILL.md 동시 다운로드 수 — GitHub 부하와 지연의 절충 */
const FETCH_CONCURRENCY = 8

/** 유사도 계산에 쓰는 본문 길이 상한 — 아주 긴 문서의 비교 비용을 막는다 */
const SIMILARITY_TEXT_CAP = 8000

/** 이 유사도(문자 3-그램 자카드) 이상이면 "같은 스킬이 드리프트된 것"으로 본다 */
const SIMILAR_THRESHOLD = 0.5

let cache: { key: string; result: AxPanelResult<AxSkillDiffData>; expiresAt: number } | null = null

/** 테스트에서 캐시를 초기화하기 위한 헬퍼 */
export function __resetSkillDiffCache(): void {
  cache = null
}

/**
 * 비교용 본문 정규화 — frontmatter 제거 + 공백 접기
 *
 * 포맷·메타데이터 차이가 아니라 실질 내용을 비교하기 위한 전처리다.
 *
 * @param text - SKILL.md 원문
 * @returns 정규화된 본문
 */
export function normalizeSkillDoc(text: string | null | undefined): string {
  if (!text) return ''
  const withoutFrontmatter = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  return withoutFrontmatter.replace(/\s+/g, ' ').trim()
}

/**
 * 문자 3-그램 자카드 유사도 (0~1)
 *
 * difflib류 시퀀스 비교보다 훨씬 싸고, "드리프트된 같은 문서 vs 완전 다른 문서"를
 * 가르는 데는 충분하다. 화면에는 지표 이름을 그대로 밝힌다.
 *
 * @param a - 정규화된 본문 A
 * @param b - 정규화된 본문 B
 * @returns 유사도 0~1
 */
export function trigramSimilarity(a: string, b: string): number {
  const textA = a.slice(0, SIMILARITY_TEXT_CAP)
  const textB = b.slice(0, SIMILARITY_TEXT_CAP)
  if (textA === textB) return 1
  if (textA.length < 3 || textB.length < 3) return 0

  const grams = (text: string): Set<string> => {
    const set = new Set<string>()
    for (let index = 0; index <= text.length - 3; index++) {
      set.add(text.slice(index, index + 3))
    }
    return set
  }

  const setA = grams(textA)
  const setB = grams(textB)
  let intersection = 0
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** 정규화 본문의 해시 — 교차 일치(이름 다르고 내용 같음) 판정용 */
function contentHash(normalized: string): string {
  return createHash('sha1').update(normalized).digest('hex')
}

/**
 * 에이전트 스킬 SKILL.md 원문을 동시성 제한을 두고 내려받는다
 *
 * @param repo - "owner/repo"
 * @param token - GitHub 토큰
 * @param paths - 스킬 id → SKILL.md 경로
 * @returns 스킬 id → 원문 (실패한 항목은 없음)
 */
async function fetchSkillDocs(
  repo: string,
  token: string,
  paths: Array<{ id: string; path: string }>
): Promise<Map<string, string>> {
  const contents = new Map<string, string>()
  const queue = [...paths]

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo}/contents/${item.path}/SKILL.md`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
            signal: AbortSignal.timeout(10_000),
          }
        )
        if (!res.ok) continue
        const body = (await res.json()) as { content?: string }
        if (typeof body.content !== 'string') continue
        contents.set(item.id, Buffer.from(body.content, 'base64').toString('utf-8'))
      } catch {
        // 개별 실패는 fetchFailures로 집계된다 — 전체를 죽이지 않는다
      }
    }
  }

  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker))
  return contents
}

/** 스킬 비교 패널 */
export const skillDiffPanel: AxPanel<AxSkillDiffData> = {
  meta: META,
  async load(): Promise<AxPanelResult<AxSkillDiffData>> {
    const config = resolveSharedRepoConfig()
    if (!config.ok) {
      return panelNotConfigured(META, `${config.missing} 환경변수가 설정되지 않았습니다`)
    }

    const cacheKey = `${config.repo}|${config.skillsPath}`
    if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) {
      return cache.result
    }

    try {
      // 1. 양쪽 인벤토리
      const tree = await fetchRepoTree(config.repo, config.token)
      if (tree.truncated === true) {
        // 목록이 잘렸는데 비교를 내면 "빠진 스킬 = 차이 없음"으로 읽힌다 — 닫는 쪽이 정직하다
        return panelError(META, '저장소 트리가 잘려 비교가 불완전합니다. 잠시 후 다시 시도해 주세요')
      }
      const agentSkills = extractSkills(tree.tree ?? [], config.skillsPath).filter(
        (skill) => skill.hasSkillDoc
      )

      const aitkRows = await db
        .select({ id: catalogItems.id, content: catalogItems.content })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.type, 'skill'),
            or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
          )
        )
      const aitkById = new Map(aitkRows.map((row) => [row.id, normalizeSkillDoc(row.content)]))

      // 2. 에이전트 SKILL.md 원문 (무거운 구간 — 1시간 캐시의 이유)
      const agentDocs = await fetchSkillDocs(config.repo, config.token, agentSkills)
      const agentNormalized = new Map(
        Array.from(agentDocs.entries()).map(([id, text]) => [id, normalizeSkillDoc(text)])
      )

      // 3. 이름이 같은 쌍의 내용 판정
      const identical: AxSkillDiffRow[] = []
      const similar: AxSkillDiffRow[] = []
      const different: AxSkillDiffRow[] = []
      let fetchFailures = 0

      for (const skill of agentSkills) {
        const aitkDoc = aitkById.get(skill.id)
        if (aitkDoc === undefined) continue // 겹치지 않는 스킬은 이 패널의 대상이 아니다

        const agentDoc = agentNormalized.get(skill.id)
        if (agentDoc === undefined) {
          fetchFailures += 1
          continue
        }

        const row: AxSkillDiffRow = {
          id: skill.id,
          similarity: aitkDoc === agentDoc ? 1 : trigramSimilarity(aitkDoc, agentDoc),
          aitkLength: aitkDoc.length,
          agentLength: agentDoc.length,
        }

        if (aitkDoc === agentDoc) identical.push(row)
        else if ((row.similarity ?? 0) >= SIMILAR_THRESHOLD) similar.push(row)
        else different.push(row)
      }

      similar.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      different.sort((a, b) => (a.similarity ?? 0) - (b.similarity ?? 0))

      // 4. 교차 일치 — 이름은 다른데 정규화 내용이 완전히 같은 쌍
      const agentHashes = new Map<string, string>()
      for (const [id, doc] of agentNormalized) {
        if (doc) agentHashes.set(contentHash(doc), id)
      }
      const crossMatches: AxSkillDiffData['crossMatches'] = []
      for (const [aitkId, doc] of aitkById) {
        if (!doc) continue
        const agentId = agentHashes.get(contentHash(doc))
        if (agentId && agentId !== aitkId) {
          crossMatches.push({ aitkId, agentId })
        }
      }
      crossMatches.sort((a, b) => a.agentId.localeCompare(b.agentId))

      const result = panelOk(META, {
        basis: {
          aitkSkills: aitkRows.length,
          agentSkills: agentSkills.length,
          comparedDocs: identical.length + similar.length + different.length,
        },
        identical,
        similar,
        different,
        crossMatches,
        fetchFailures,
      })
      cache = { key: cacheKey, result, expiresAt: Date.now() + CACHE_TTL_MS }

      return result
    } catch (error) {
      log.error('스킬 비교 실패', error, { repo: config.repo })
      return panelError(META, '스킬 비교 데이터를 만들지 못했습니다')
    }
  },
}
