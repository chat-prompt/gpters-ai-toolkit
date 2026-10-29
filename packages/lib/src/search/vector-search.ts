import { db, catalogItems, type CatalogItemRecord } from '@gpters/db'
import { sql, eq, and, or, gt, desc } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm'
import { generateEmbedding } from './embedding'
import { isRerankAvailable, rerankCandidates, type RerankSkipReason } from './rerank'
import { createLogger } from '../core/logger'
import type { ItemType } from '../core/types'

const log = createLogger('vector-search')

export interface SemanticSearchOptions {
  query: string
  type?: ItemType | 'all'
  limit?: number
  minSimilarity?: number
  userId?: string
  userRole?: string
  orgId?: string
  /** Optional user context combined with query for improved embedding relevance */
  userContext?: string
  /** MCP 클라이언트 타입 (플랫폼 필터링용) */
  clientType?: string
  /**
   * Pre-computed embedding for the (query + userContext) combination.
   * When provided, skips the internal `generateEmbedding` call and reuses
   * this vector directly. Callers that need the same embedding for multiple
   * downstream queries (e.g. exercise skill search fanning out to MCP and
   * CLI vector search) should compute it once and pass it here to avoid
   * duplicate OpenAI API calls.
   */
  queryEmbedding?: number[]
  /**
   * 임베딩 점수가 뭉칠 때 JEV로 재랭킹할지 (기본 true).
   * `TYPESAFE_API_KEY`가 없거나 JEV 오류 휴지 중이면 이 값과 무관하게 기존 방식으로 검색한다.
   */
  rerank?: boolean
}

/** 재랭킹할 때 최종 limit 대비 몇 배를 후보로 뽑는가 */
const RERANK_OVERFETCH_FACTOR = 4

/** 재랭킹 후보 수 상한 */
const RERANK_MAX_CANDIDATES = 40

/**
 * 재랭킹 기록 — 재랭킹 전/후 순위를 둘 다 남기기 위한 정보
 */
export interface SemanticSearchRerankInfo {
  /** JEV 순서가 실제로 적용됐는지 */
  applied: boolean
  /** 적용되지 않은 이유 */
  skipReason?: RerankSkipReason
  /** 후보 수 (overfetch 포함) */
  candidateCount: number
  /** 항목 ID → 재랭킹 전(임베딩) 순위, 1부터 */
  embeddingRanks: Record<string, number>
  /** 항목 ID → JEV noul 점수 (JEV를 불렀을 때만) */
  scores?: Record<string, number>
  /** JEV 호출 시간(ms) */
  jevMs?: number
}

export interface SemanticSearchResult {
  items: Array<CatalogItemRecord & { similarity: number }>
  total: number
  searchTime: number
  /** 재랭킹 기록 (본 경로에서 재랭킹을 시도했을 때만) */
  rerank?: SemanticSearchRerankInfo
}

export async function semanticSearch(options: SemanticSearchOptions): Promise<SemanticSearchResult> {
  const startTime = Date.now()
  const {
    query,
    type = 'all',
    limit = 10,
    minSimilarity = 0.15,
    userContext,
    clientType,
    queryEmbedding: providedEmbedding,
    rerank = true,
  } = options

  const rerankEnabled = rerank && isRerankAvailable()
  const fetchLimit = rerankEnabled
    ? Math.min(Math.max(limit * RERANK_OVERFETCH_FACTOR, limit), RERANK_MAX_CANDIDATES)
    : limit

  const cleanedQuery = cleanQuery(query)
  if (!cleanedQuery) {
    log.info('Noise query filtered', { query: query.trim().slice(0, 80) })
    return { items: [], total: 0, searchTime: 0 }
  }

  // Combine query with userContext for improved embedding relevance
  const embeddingText = userContext
    ? `${cleanedQuery} ${userContext.trim()}`
    : cleanedQuery

  const embeddingStart = Date.now()
  const queryEmbedding = providedEmbedding ?? await generateEmbedding(embeddingText)
  const embeddingMs = providedEmbedding ? 0 : Date.now() - embeddingStart

  const vectorSimilarity = sql<number>`1 - (${cosineDistance(catalogItems.embedding, queryEmbedding)})`

  // 검색어에 스킬 ID·이름이 그대로 있으면 콕 집어 부른 것으로 보고 점수를 더하고 맨 앞에 세운다 (DEV-4697).
  // 1.0으로 확정하지 않는 건 흔한 단어 이름(`회고`)이 지나가듯 걸려도 추천 기준에서 걸러지게 하려는 것이다.
  // 맥락(userContext)은 임베딩에만 쓰고 이름 판정에는 쓰지 않는다
  const nameMatch = nameInQuerySql(cleanedQuery)
  const similarity = sql<number>`(1 - (${cosineDistance(catalogItems.embedding, queryEmbedding)}))
    + CASE WHEN ${nameMatch} THEN ${NAME_IN_QUERY_BONUS}::float8 ELSE 0 END`

  const conditions = [
    or(gt(vectorSimilarity, minSimilarity), nameMatch)!,
    eq(catalogItems.status, 'published'),
    sql`${catalogItems.embedding} IS NOT NULL`,
  ]

  if (type && type !== 'all') {
    conditions.push(eq(catalogItems.type, type))
  }

  // Platform compatibility filtering
  // web_browser, cli, unknown, agent는 필터링하지 않음 (모든 스킬 노출)
  if (clientType && !['web_browser', 'unknown', 'cli', 'openclaw', 'agent'].includes(clientType)) {
    conditions.push(
      or(
        sql`${catalogItems.platforms} IS NULL`,
        sql`${catalogItems.platforms} @> ARRAY[${clientType}]::text[]`
      )!
    )
  }

  const dbStart = Date.now()
  const results = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      name: catalogItems.name,
      description: catalogItems.description,
      authorId: catalogItems.authorId,
      tags: catalogItems.tags,
      difficulty: catalogItems.difficulty,
      pluginId: catalogItems.pluginId,
      estimatedTime: catalogItems.estimatedTime,
      dependencies: catalogItems.dependencies,
      likes: catalogItems.likes,
      content: catalogItems.content,
      readme: catalogItems.readme,
      files: catalogItems.files,
      allowedTools: catalogItems.allowedTools,
      agentModel: catalogItems.agentModel,
      agentPermissionMode: catalogItems.agentPermissionMode,
      agentSkills: catalogItems.agentSkills,
      commandArgumentHint: catalogItems.commandArgumentHint,
      commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
      hookEvent: catalogItems.hookEvent,
      hookMatcher: catalogItems.hookMatcher,
      hookCommand: catalogItems.hookCommand,
      hookTimeout: catalogItems.hookTimeout,
      hookBlocking: catalogItems.hookBlocking,
      mcpEnabled: catalogItems.mcpEnabled,
      platforms: catalogItems.platforms,
      version: catalogItems.version,
      status: catalogItems.status,
      changelog: catalogItems.changelog,
      createdAt: catalogItems.createdAt,
      updatedAt: catalogItems.updatedAt,
      similarity,
      nameMatch: sql<boolean>`${nameMatch}`,
    })
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(desc(sql`${nameMatch}`), desc(similarity), desc(vectorSimilarity))
    .limit(fetchLimit)
  const dbMs = Date.now() - dbStart

  // Keyword fallback when semantic search returns no results
  if (results.length === 0) {
    log.info('Semantic search returned 0 results, trying keyword fallback', { query: cleanedQuery })
    const keywordPattern = `%${cleanedQuery}%`
    const keywordConditions = [
      eq(catalogItems.status, 'published'),
      or(
        sql`${catalogItems.name} ILIKE ${keywordPattern}`,
        sql`${catalogItems.description} ILIKE ${keywordPattern}`,
        sql`${catalogItems.tags}::text ILIKE ${keywordPattern}`,
      )!,
    ]

    if (type && type !== 'all') {
      keywordConditions.push(eq(catalogItems.type, type))
    }

    // Apply same platform compatibility filtering
    if (clientType && !['web_browser', 'unknown', 'cli', 'openclaw', 'agent'].includes(clientType)) {
      keywordConditions.push(
        or(
          sql`${catalogItems.platforms} IS NULL`,
          sql`${catalogItems.platforms} @> ARRAY[${clientType}]::text[]`
        )!
      )
    }

    const fallbackStart = Date.now()
    const fallbackResults = await db
      .select({
        id: catalogItems.id,
        type: catalogItems.type,
        name: catalogItems.name,
        description: catalogItems.description,
        authorId: catalogItems.authorId,
        tags: catalogItems.tags,
        difficulty: catalogItems.difficulty,
        pluginId: catalogItems.pluginId,
        estimatedTime: catalogItems.estimatedTime,
        dependencies: catalogItems.dependencies,
        likes: catalogItems.likes,
        content: catalogItems.content,
        readme: catalogItems.readme,
        files: catalogItems.files,
        allowedTools: catalogItems.allowedTools,
        agentModel: catalogItems.agentModel,
        agentPermissionMode: catalogItems.agentPermissionMode,
        agentSkills: catalogItems.agentSkills,
        commandArgumentHint: catalogItems.commandArgumentHint,
        commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
        hookEvent: catalogItems.hookEvent,
        hookMatcher: catalogItems.hookMatcher,
        hookCommand: catalogItems.hookCommand,
        hookTimeout: catalogItems.hookTimeout,
        hookBlocking: catalogItems.hookBlocking,
        mcpEnabled: catalogItems.mcpEnabled,
        platforms: catalogItems.platforms,
        version: catalogItems.version,
        status: catalogItems.status,
        changelog: catalogItems.changelog,
        createdAt: catalogItems.createdAt,
        updatedAt: catalogItems.updatedAt,
        similarity: sql<number>`0.1`.as('similarity'),
      })
      .from(catalogItems)
      .where(and(...keywordConditions))
      .orderBy(desc(catalogItems.updatedAt))
      .limit(limit)
    const fallbackMs = Date.now() - fallbackStart

    const searchTime = Date.now() - startTime
    log.info('Keyword fallback completed', {
      fallbackMs,
      totalMs: searchTime,
      resultCount: fallbackResults.length,
    })

    return {
      items: fallbackResults as Array<CatalogItemRecord & { similarity: number }>,
      total: fallbackResults.length,
      searchTime,
    }
  }

  const candidates = results as Array<CatalogItemRecord & { similarity: number; nameMatch: boolean }>
  let items = candidates
  let rerankInfo: SemanticSearchRerankInfo | undefined
  if (rerankEnabled) {
    const outcome = await rerankCandidates(cleanedQuery, candidates, { userContext })
    items = outcome.items
    rerankInfo = {
      applied: outcome.applied,
      skipReason: outcome.skipReason,
      candidateCount: candidates.length,
      embeddingRanks: Object.fromEntries(candidates.map((c, i) => [c.id, i + 1])),
      scores: outcome.scores,
      jevMs: outcome.jevMs,
    }
  }
  // 재랭킹이 순서를 바꿔도 이름으로 부른 스킬은 맨 앞에 둔다 (sort 는 안정 정렬)
  items = [...items].sort((a, b) => Number(isNameMatch(b)) - Number(isNameMatch(a))).slice(0, limit)

  const searchTime = Date.now() - startTime

  log.info('Semantic search completed', {
    embeddingMs,
    dbMs,
    totalMs: searchTime,
    resultCount: items.length,
    ...(rerankInfo && {
      rerankApplied: rerankInfo.applied,
      rerankSkipReason: rerankInfo.skipReason,
      rerankCandidates: rerankInfo.candidateCount,
      jevMs: rerankInfo.jevMs,
      embeddingTop: candidates.slice(0, limit).map((c) => c.id),
      finalTop: items.map((c) => c.id),
    }),
  })

  return {
    items,
    total: items.length,
    searchTime,
    ...(rerankInfo && { rerank: rerankInfo }),
  }
}

export async function findSimilarItems(
  itemId: string,
  limit = 5
): Promise<Array<CatalogItemRecord & { similarity: number }>> {
  const [item] = await db
    .select({ embedding: catalogItems.embedding })
    .from(catalogItems)
    .where(eq(catalogItems.id, itemId))
    .limit(1)

  if (!item?.embedding) {
    return []
  }

  const similarity = sql<number>`1 - (${cosineDistance(catalogItems.embedding, item.embedding)})`

  const results = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      name: catalogItems.name,
      description: catalogItems.description,
      authorId: catalogItems.authorId,
      tags: catalogItems.tags,
      difficulty: catalogItems.difficulty,
      pluginId: catalogItems.pluginId,
      estimatedTime: catalogItems.estimatedTime,
      dependencies: catalogItems.dependencies,
      likes: catalogItems.likes,
      content: catalogItems.content,
      readme: catalogItems.readme,
      files: catalogItems.files,
      allowedTools: catalogItems.allowedTools,
      agentModel: catalogItems.agentModel,
      agentPermissionMode: catalogItems.agentPermissionMode,
      agentSkills: catalogItems.agentSkills,
      commandArgumentHint: catalogItems.commandArgumentHint,
      commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
      hookEvent: catalogItems.hookEvent,
      hookMatcher: catalogItems.hookMatcher,
      hookCommand: catalogItems.hookCommand,
      hookTimeout: catalogItems.hookTimeout,
      hookBlocking: catalogItems.hookBlocking,
      mcpEnabled: catalogItems.mcpEnabled,
      platforms: catalogItems.platforms,
      version: catalogItems.version,
      status: catalogItems.status,
      changelog: catalogItems.changelog,
      createdAt: catalogItems.createdAt,
      updatedAt: catalogItems.updatedAt,
      similarity,
    })
    .from(catalogItems)
    .where(and(
      sql`${catalogItems.id} != ${itemId}`,
      eq(catalogItems.status, 'published'),
      sql`${catalogItems.embedding} IS NOT NULL`,
    ))
    .orderBy(desc(similarity))
    .limit(limit)

  return results as Array<CatalogItemRecord & { similarity: number }>
}

/** 검색어에 스킬 ID·이름이 그대로 있을 때 더하는 점수. 순서는 점수와 상관없이 맨 앞이다 */
const NAME_IN_QUERY_BONUS = 0.3

/** 영문으로 보는 문자 범위 — 이 범위만으로 된 띄어쓰기 없는 이름은 단어 단위로 맞춘다 */
const ASCII_NAME_PATTERN = '^[a-zA-Z0-9 .+#_-]*$'

/** DB 결과의 nameMatch 열. 드라이버에 따라 문자열로 올 수 있어 둘 다 받는다 */
function isNameMatch(item: object): boolean {
  const v = (item as { nameMatch?: unknown }).nameMatch
  return v === true || v === 't' || v === 'true'
}

/**
 * 검색어에서 영문 단어를 뽑는다. 스킬 ID·영문 이름을 단어 단위로 맞추는 데 쓴다.
 *
 * 한글·공백·기호에서 끊으므로 조사가 붙어도(`PR을`, `write-post로`) 단어가 남는다.
 * 앞뒤 `.`·`-`·`_`는 떼고 2글자 미만은 버린다.
 *
 * @example extractAsciiWords('이 PR을 Next.js로 리뷰') // ['pr', 'next.js']
 */
export function extractAsciiWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9.+#_-]+/)
    .map(w => w.replace(/^[._-]+|[._-]+$/g, ''))
    .filter(w => w.length >= 2)
  return [...new Set(words)]
}

/**
 * 검색어에 스킬 ID나 이름이 그대로 들어 있는지 보는 SQL 조건.
 *
 * - ID(`write-post`): 단어 단위로 맞춘다. `post`가 `write-post`에 걸리지 않는다.
 * - 띄어쓰기 없는 영문 이름(`md2pdf`): 단어 단위.
 * - 나머지 이름(`회의록 작성`, `Receiving Code Review`): 부분 문자열. 조사가 붙어도 걸린다.
 *   3글자 미만은 부분 문자열로 맞추지 않는다. `보고`가 `보고서`에, `회고`가 `회고록`에 걸려 맨 앞에 서는 걸 막는다.
 *
 * 태그는 보지 않는다 — 태그 보너스는 41개 검색 기록에서 1위 정답을 줄였다 (DEV-4698).
 *
 * @internal 테스트(`name-in-query-sql.test.ts`)에서 실제 Postgres 로 식을 검증하려고 export 한다.
 */
export function nameInQuerySql(cleanedQuery: string) {
  const lowerQuery = cleanedQuery.toLowerCase()
  const words = extractAsciiWords(cleanedQuery)
  const wordsArray = words.length > 0
    ? sql`ARRAY[${sql.join(words.map(w => sql`${w}`), sql`, `)}]::text[]`
    : sql`ARRAY[]::text[]`

  return sql`(lower(${catalogItems.id}) = ANY(${wordsArray})
    OR (length(${catalogItems.name}) >= 2 AND CASE
          WHEN ${catalogItems.name} ~ ${ASCII_NAME_PATTERN} AND strpos(${catalogItems.name}, ' ') = 0
            THEN lower(${catalogItems.name}) = ANY(${wordsArray})
          ELSE char_length(${catalogItems.name}) >= 3 AND strpos(${lowerQuery}, lower(${catalogItems.name})) > 0
        END))`
}

/** Maximum query length for meaningful semantic search */
const MAX_QUERY_LENGTH = 500

/** Minimum query length for meaningful semantic search */
const MIN_QUERY_LENGTH = 2

/**
 * Strips noise prefixes from a query and validates the remainder.
 *
 * Phase 1: Strips removable noise (image placeholders like `[Image 1]`).
 * Phase 2: Rejects structural noise that cannot be cleaned — mode prompt
 * injections (`[analyze-mode]`), XML mode tags (`<ultrawork-mode>`),
 * and queries that are too short or too long after stripping.
 *
 * @returns Cleaned query string, or `null` if the query is pure noise.
 */
export function cleanQuery(query: string): string | null {
  // Phase 1: Strip removable noise prefixes
  let cleaned = query.trim()

  // Strip image placeholders: [Image 1], [image 2], etc. (may appear multiple times)
  cleaned = cleaned.replace(/\[image\s+\d+\]\s*/gi, '').trim()

  // Phase 2: Reject structural noise that can't be cleaned
  if (!cleaned) return null

  // Mode prompt injections: [analyze-mode], [search-mode], etc.
  if (/^\[[\w-]+-mode\]/i.test(cleaned)) return null

  // XML-like mode tags: <ultrawork-mode>, <deep-research>, etc.
  if (/<[\w-]+-mode>/i.test(cleaned)) return null

  // Too short to be a meaningful search
  if (cleaned.length < MIN_QUERY_LENGTH) return null

  // Bare Hangul jamo (ㄱㄴㄷ..ㅎ, ㅏㅑ..ㅣ) without composed syllables — not meaningful
  if (/^[\u3131-\u318E\s]+$/.test(cleaned)) return null

  // Too long — likely pasted error logs, code, or system prompts
  if (cleaned.length > MAX_QUERY_LENGTH) return null

  return cleaned
}

/**
 * Checks whether a query is structural noise.
 *
 * Convenience wrapper around {@link cleanQuery} for boolean checks.
 */
export function isNoiseQuery(query: string): boolean {
  return cleanQuery(query) === null
}
