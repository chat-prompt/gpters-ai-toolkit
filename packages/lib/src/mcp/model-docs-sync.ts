/**
 * AI model documentation sync via official provider pages (EDU-6875)
 *
 * Fetches latest model information from Anthropic, Google, and OpenAI
 * official documentation pages, parses model names and API IDs,
 * and stores the results in the ai_model_docs table.
 *
 * Consumed by Rona via GET /api/models endpoint.
 */

import { db, aiModelDocs } from '@gpters/db'
import { eq } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('model-docs-sync')

/** Parsed model info for a single provider */
export interface ProviderModelInfo {
  provider: 'anthropic' | 'google' | 'openai'
  latestModels: string
  apiIds: string
  deprecated: string
  models: Array<{
    name: string
    apiId: string
    deprecated: boolean
    recommended: boolean
  }>
}

/** Summary of a full sync run */
export interface ModelDocsSyncSummary {
  synced: number
  failed: number
  unchanged: number
  results: Array<{
    provider: string
    status: 'updated' | 'unchanged' | 'failed'
    error?: string
  }>
  durationMs: number
}

/** Response format for GET /api/models */
export interface ModelsApiResponse {
  providers: Array<{
    name: string
    latestModels: string
    apiIds: string
    deprecated: string[]
    updatedOn: string | null
  }>
  lastSyncedAt: string | null
}

// --- Source URLs ---

const SOURCES = [
  {
    provider: 'anthropic' as const,
    url: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    parser: parseAnthropicContent,
  },
  {
    provider: 'google' as const,
    url: 'https://ai.google.dev/gemini-api/docs/models',
    parser: parseGoogleContent,
  },
  {
    provider: 'openai' as const,
    url: 'https://raw.githubusercontent.com/openai/openai-python/main/src/openai/types/shared/chat_model.py',
    parser: parseOpenAIContent,
  },
] as const

// --- Parsers ---

/**
 * Parse Anthropic model page for Claude model names and API IDs
 */
function parseAnthropicContent(html: string): ProviderModelInfo | null {
  try {
    const models: Array<{ name: string; apiId: string; deprecated: boolean; recommended: boolean }> = []
    const displayNames: string[] = []
    const displayIds: string[] = []

    // Extract model names like "Claude Opus 4.6", "Claude Sonnet 4.6"
    const modelPattern = /(?:Claude\s+)?(Opus|Sonnet|Haiku)\s+(\d+\.?\d*)/gi
    const seen = new Set<string>()

    for (const m of html.matchAll(modelPattern)) {
      const name = `${m[1]} ${m[2]}`
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        displayNames.push(name)
      }
    }

    // Extract API model IDs like "claude-opus-4-6"
    const idPattern = /claude-(?:opus|sonnet|haiku)-[\d-]+(?:\d{8})?/g
    const seenIds = new Set<string>()

    for (const m of html.matchAll(idPattern)) {
      if (!seenIds.has(m[0])) {
        seenIds.add(m[0])
        displayIds.push(m[0])
      }
    }

    if (displayNames.length === 0) return null

    // Build structured models array
    for (let i = 0; i < Math.min(displayNames.length, 3); i++) {
      models.push({
        name: displayNames[i],
        apiId: displayIds[i] || '',
        deprecated: false,
        recommended: i === 0,
      })
    }

    return {
      provider: 'anthropic',
      latestModels: displayNames.slice(0, 3).join(', '),
      apiIds: displayIds.slice(0, 3).join(', '),
      deprecated: '~~3.5~~, ~~3~~',
      models,
    }
  } catch {
    return null
  }
}

/**
 * Parse Google Gemini model page for model names and API IDs
 */
function parseGoogleContent(html: string): ProviderModelInfo | null {
  try {
    const models: Array<{ name: string; apiId: string; deprecated: boolean; recommended: boolean }> = []
    const displayNames: string[] = []
    const displayIds: string[] = []

    // Extract "Gemini X.Y Pro/Flash/Ultra" patterns
    const modelPattern = /Gemini\s+(\d+\.?\d*)\s+(Pro|Flash|Ultra)/gi
    const seen = new Set<string>()

    for (const m of html.matchAll(modelPattern)) {
      const name = `Gemini ${m[1]} ${m[2]}`
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        displayNames.push(name)
      }
    }

    // API IDs like "gemini-3.1-pro-preview"
    const idPattern = /gemini-[\d.]+-(?:pro|flash|ultra)[\w-]*/gi
    const seenIds = new Set<string>()

    for (const m of html.matchAll(idPattern)) {
      if (!seenIds.has(m[0].toLowerCase())) {
        seenIds.add(m[0].toLowerCase())
        displayIds.push(m[0])
      }
    }

    if (displayNames.length === 0) return null

    for (let i = 0; i < Math.min(displayNames.length, 3); i++) {
      models.push({
        name: displayNames[i],
        apiId: displayIds[i] || '',
        deprecated: false,
        recommended: i === 0,
      })
    }

    return {
      provider: 'google',
      latestModels: displayNames.slice(0, 3).join(', '),
      apiIds: displayIds.slice(0, 3).join(', '),
      deprecated: '~~2.5~~, ~~1.5~~',
      models,
    }
  } catch {
    return null
  }
}

/**
 * Parse OpenAI Python SDK type definition for model IDs
 */
function parseOpenAIContent(content: string): ProviderModelInfo | null {
  try {
    const literalMatch = content.match(/Literal\[([\s\S]+?)\]/)
    if (!literalMatch) return null

    const ids: string[] = []
    const idPattern = /"(gpt-[\d.]+[\w-]*|o\d[\w-]*)"/g
    for (const m of literalMatch[1].matchAll(idPattern)) {
      if (!ids.includes(m[1])) ids.push(m[1])
    }

    if (ids.length === 0) return null

    // Base model IDs only (exclude dated variants and aliases)
    const baseIds = ids.filter(
      (id) =>
        !/\d{4}-\d{2}-\d{2}/.test(id) &&
        !id.endsWith('-latest') &&
        !id.endsWith('-preview')
    )
    const displayNames = baseIds.slice(0, 3).map((id) => id.toUpperCase())
    const displayIds = baseIds.slice(0, 3)

    const models = displayNames.map((name, i) => ({
      name,
      apiId: displayIds[i],
      deprecated: false,
      recommended: i === 0,
    }))

    return {
      provider: 'openai',
      latestModels: displayNames.join(', '),
      apiIds: displayIds.join(', '),
      deprecated: '~~4o~~, ~~4.1~~',
      models,
    }
  } catch {
    return null
  }
}

// --- Fetch helper ---

/**
 * Fetch a page with timeout and user-agent
 */
async function fetchSource(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      log.warn('Source fetch failed', { url, status: res.status })
      return null
    }
    return await res.text()
  } catch (err) {
    log.warn('Source fetch error', { url, error: (err as Error).message })
    return null
  }
}

/**
 * Compute SHA-256 hash of content for change detection
 */
async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// --- Core sync functions ---

/**
 * Sync model documentation from all providers
 *
 * Fetches official pages, parses model info, and upserts into ai_model_docs.
 * Uses content hashing to skip unchanged providers.
 */
export async function syncModelDocs(): Promise<ModelDocsSyncSummary> {
  const startTime = Date.now()

  log.info('Starting model docs sync', { providers: SOURCES.map((s) => s.provider) })

  const results: ModelDocsSyncSummary['results'] = []
  let synced = 0
  let failed = 0
  let unchanged = 0

  // Fetch all sources in parallel
  const fetchResults = await Promise.all(
    SOURCES.map(async (src) => {
      const raw = await fetchSource(src.url)
      return { ...src, raw }
    })
  )

  for (const { provider, parser, raw } of fetchResults) {
    if (!raw) {
      failed++
      results.push({ provider, status: 'failed', error: 'Fetch failed' })

      // Mark sync failure in DB
      await db
        .insert(aiModelDocs)
        .values({
          provider,
          syncStatus: 'failed',
          syncError: 'Fetch failed',
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: aiModelDocs.provider,
          set: {
            syncStatus: 'failed',
            syncError: 'Fetch failed',
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        })
      continue
    }

    // Check content hash for change detection
    const hash = await hashContent(raw)
    const existing = await db
      .select({ contentHash: aiModelDocs.contentHash })
      .from(aiModelDocs)
      .where(eq(aiModelDocs.provider, provider))
      .limit(1)

    if (existing.length > 0 && existing[0].contentHash === hash) {
      unchanged++
      results.push({ provider, status: 'unchanged' })

      // Update lastSyncedAt even if unchanged
      await db
        .update(aiModelDocs)
        .set({ lastSyncedAt: new Date(), syncStatus: 'success', syncError: null, updatedAt: new Date() })
        .where(eq(aiModelDocs.provider, provider))
      continue
    }

    // Parse model info
    const info = parser(raw)
    if (!info) {
      failed++
      results.push({ provider, status: 'failed', error: 'Parse failed' })

      await db
        .insert(aiModelDocs)
        .values({
          provider,
          syncStatus: 'partial',
          syncError: 'Parse failed — page structure may have changed',
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: aiModelDocs.provider,
          set: {
            syncStatus: 'partial',
            syncError: 'Parse failed — page structure may have changed',
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        })
      continue
    }

    // Upsert model data
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    await db
      .insert(aiModelDocs)
      .values({
        provider,
        models: info.models,
        latestModels: info.latestModels,
        apiIds: info.apiIds,
        deprecatedPatterns: info.deprecated,
        updatedOn: dateStr,
        rawContent: raw,
        contentHash: hash,
        lastSyncedAt: now,
        syncStatus: 'success',
        syncError: null,
      })
      .onConflictDoUpdate({
        target: aiModelDocs.provider,
        set: {
          models: info.models,
          latestModels: info.latestModels,
          apiIds: info.apiIds,
          deprecatedPatterns: info.deprecated,
          updatedOn: dateStr,
          rawContent: raw,
          contentHash: hash,
          lastSyncedAt: now,
          syncStatus: 'success',
          syncError: null,
          updatedAt: now,
        },
      })

    synced++
    results.push({ provider, status: 'updated' })
    log.info('Provider synced', { provider, models: info.latestModels })
  }

  const durationMs = Date.now() - startTime

  log.info('Model docs sync completed', { synced, failed, unchanged, durationMs })

  return { synced, failed, unchanged, results, durationMs }
}

/**
 * Get latest model mapping table from DB
 *
 * Returns formatted provider data for consumption by Rona and other services.
 */
export async function getLatestModels(): Promise<ModelsApiResponse> {
  const rows = await db
    .select({
      provider: aiModelDocs.provider,
      latestModels: aiModelDocs.latestModels,
      apiIds: aiModelDocs.apiIds,
      deprecatedPatterns: aiModelDocs.deprecatedPatterns,
      updatedOn: aiModelDocs.updatedOn,
      lastSyncedAt: aiModelDocs.lastSyncedAt,
    })
    .from(aiModelDocs)
    .where(eq(aiModelDocs.syncStatus, 'success'))

  const providerNameMap: Record<string, string> = {
    anthropic: 'Anthropic',
    google: 'Google',
    openai: 'OpenAI',
  }

  const providers = rows.map((row) => ({
    name: providerNameMap[row.provider] || row.provider,
    latestModels: row.latestModels || '',
    apiIds: row.apiIds || '',
    deprecated: (row.deprecatedPatterns || '')
      .split(',')
      .map((d) => d.trim().replace(/~~/g, ''))
      .filter(Boolean),
    updatedOn: row.updatedOn,
  }))

  // Find most recent sync timestamp
  const lastSyncedAt = rows.reduce<Date | null>((latest, row) => {
    if (!row.lastSyncedAt) return latest
    if (!latest || row.lastSyncedAt > latest) return row.lastSyncedAt
    return latest
  }, null)

  return {
    providers,
    lastSyncedAt: lastSyncedAt?.toISOString() || null,
  }
}
