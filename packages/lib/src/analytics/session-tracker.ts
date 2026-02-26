/**
 * MCP Session Tracker
 *
 * Aggregates per-session activity from individual MCP requests.
 * Uses PostgreSQL ON CONFLICT upsert for atomic session updates.
 */

import { db, mcpSessions } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('session-tracker')

/** Maximum number of entries in actionLog JSONB array */
const ACTION_LOG_CAP = 100

/** Session action types derived from MCP tool names */
export type SessionAction = 'search' | 'view' | 'deploy' | 'suggest' | 'other'

/**
 * Input for upserting a session summary
 */
export interface SessionUpsertInput {
  sessionId: string
  userId?: string
  accessTokenId?: string
  clientType?: string
  clientName?: string
  clientVersion?: string
  ipHash?: string
  tool?: string
  method?: string
  responseStatus: 'success' | 'error' | 'rate_limited'
  responseTime?: number
  skillId?: string
  searchQuery?: string
  action?: SessionAction
}

/**
 * Client context reported by plugins via report_session_event
 */
export interface ClientContextInput {
  promptCount?: number
  suggestionsShown?: number
  suggestionsUsed?: number
  skippedSearches?: number
  sessionEndReason?: string
  pluginVersion?: string
}

/**
 * Map MCP tool name to a session action type
 *
 * @param tool - MCP tool name (e.g., 'semantic_search')
 * @returns Corresponding session action
 */
export function mapToolToAction(tool?: string): SessionAction {
  if (!tool) return 'other'
  switch (tool) {
    case 'semantic_search':
    case 'search_plugins':
      return 'search'
    case 'get_plugin_content':
      return 'view'
    case 'deploy_skill':
      return 'deploy'
    case 'suggest_improvement':
      return 'suggest'
    default:
      return 'other'
  }
}

/**
 * Extract skill/plugin ID from request body based on the tool being called
 *
 * @param body - Raw request body
 * @param tool - MCP tool name
 * @returns Extracted plugin ID or undefined
 */
export function extractSkillId(body: unknown, tool?: string): string | undefined {
  if (!body || typeof body !== 'object' || !tool) return undefined

  const rpcBody = body as Record<string, unknown>
  const params = rpcBody.params as Record<string, unknown> | undefined
  const args = params?.arguments as Record<string, unknown> | undefined

  if (!args) return undefined

  switch (tool) {
    case 'get_plugin_content':
      return args.pluginId as string | undefined
    case 'deploy_skill':
      return (args.id as string | undefined) || (args.name as string | undefined)
    case 'suggest_improvement':
      return args.pluginId as string | undefined
    default:
      return undefined
  }
}

/**
 * Extract search query from request body
 *
 * @param body - Raw request body
 * @param tool - MCP tool name
 * @returns Extracted search query or undefined
 */
export function extractSearchQuery(body: unknown, tool?: string): string | undefined {
  if (!body || typeof body !== 'object' || !tool) return undefined

  const rpcBody = body as Record<string, unknown>
  const params = rpcBody.params as Record<string, unknown> | undefined
  const args = params?.arguments as Record<string, unknown> | undefined

  if (!args) return undefined

  if (tool === 'semantic_search' || tool === 'search_plugins') {
    return args.query as string | undefined
  }

  return undefined
}

/**
 * Upsert a session summary record
 *
 * Uses PostgreSQL ON CONFLICT for atomic insert-or-update.
 * Incrementally updates JSONB fields (toolCounts, actionLog, skillInteractions).
 *
 * @param input - Session upsert data from a single MCP request
 */
export async function upsertSessionSummary(input: SessionUpsertInput): Promise<void> {
  const now = new Date()
  const action = input.action || mapToolToAction(input.tool)
  const isSuccess = input.responseStatus === 'success'
  const isError = input.responseStatus === 'error'
  const isSearch = action === 'search'
  const isView = action === 'view'
  const isDeploy = action === 'deploy'

  // Build action log entry
  const actionEntry = {
    action,
    ...(input.skillId && { skillId: input.skillId }),
    ...(input.searchQuery && { query: input.searchQuery }),
    timestamp: now.toISOString(),
  }

  // Build tool counts increment
  const toolCountsUpdate = input.tool ? { [input.tool]: 1 } : {}

  // Build skill interactions increment
  const skillInteractionsUpdate: Record<string, { searched: number; viewed: number; deployed: number }> = {}
  if (input.skillId) {
    skillInteractionsUpdate[input.skillId] = {
      searched: isSearch ? 1 : 0,
      viewed: isView ? 1 : 0,
      deployed: isDeploy ? 1 : 0,
    }
  }

  try {
    await db
      .insert(mcpSessions)
      .values({
        sessionId: input.sessionId,
        userId: input.userId,
        accessTokenId: input.accessTokenId,
        clientType: input.clientType,
        clientName: input.clientName,
        clientVersion: input.clientVersion,
        ipHash: input.ipHash,
        startedAt: now,
        lastActivityAt: now,
        totalRequests: 1,
        successCount: isSuccess ? 1 : 0,
        errorCount: isError ? 1 : 0,
        toolCounts: toolCountsUpdate,
        actionLog: [actionEntry],
        skillInteractions: skillInteractionsUpdate,
        hadSearch: isSearch,
        hadView: isView,
        hadDeployment: isDeploy,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: mcpSessions.sessionId,
        set: {
          lastActivityAt: now,
          totalRequests: sql`${mcpSessions.totalRequests} + 1`,
          successCount: isSuccess
            ? sql`${mcpSessions.successCount} + 1`
            : sql`${mcpSessions.successCount}`,
          errorCount: isError
            ? sql`${mcpSessions.errorCount} + 1`
            : sql`${mcpSessions.errorCount}`,
          // Merge tool counts: existing || '{}' merged with new entry
          toolCounts: input.tool
            ? sql`jsonb_set(
                COALESCE(${mcpSessions.toolCounts}, '{}'::jsonb),
                ${sql.raw(`'{${input.tool}}'`)},
                to_jsonb(COALESCE((COALESCE(${mcpSessions.toolCounts}, '{}'::jsonb)->>
                  ${input.tool})::int, 0) + 1)
              )`
            : sql`${mcpSessions.toolCounts}`,
          // Append to action log (capped at ACTION_LOG_CAP)
          actionLog: sql`CASE
            WHEN jsonb_array_length(COALESCE(${mcpSessions.actionLog}, '[]'::jsonb)) >= ${ACTION_LOG_CAP}
            THEN (SELECT jsonb_agg(elem) FROM (
              SELECT elem FROM jsonb_array_elements(${mcpSessions.actionLog}) AS elem
              OFFSET 1
            ) sub) || ${JSON.stringify([actionEntry])}::jsonb
            ELSE COALESCE(${mcpSessions.actionLog}, '[]'::jsonb) || ${JSON.stringify([actionEntry])}::jsonb
          END`,
          // Boolean OR flags
          hadSearch: isSearch
            ? sql`true`
            : sql`${mcpSessions.hadSearch}`,
          hadView: isView
            ? sql`true`
            : sql`${mcpSessions.hadView}`,
          hadDeployment: isDeploy
            ? sql`true`
            : sql`${mcpSessions.hadDeployment}`,
          // Update client info if not yet set
          userId: sql`COALESCE(${mcpSessions.userId}, ${input.userId ?? null})`,
          accessTokenId: sql`COALESCE(${mcpSessions.accessTokenId}, ${input.accessTokenId ?? null})`,
          clientType: sql`COALESCE(${mcpSessions.clientType}, ${input.clientType ?? null})`,
          clientName: sql`COALESCE(${mcpSessions.clientName}, ${input.clientName ?? null})`,
          clientVersion: sql`COALESCE(${mcpSessions.clientVersion}, ${input.clientVersion ?? null})`,
          ipHash: sql`COALESCE(${mcpSessions.ipHash}, ${input.ipHash ?? null})`,
          updatedAt: now,
        },
      })

    log.debug('Session upserted', { sessionId: input.sessionId, action })
  } catch (error) {
    log.error('Failed to upsert session', error, { sessionId: input.sessionId })
  }
}

/**
 * Merge client-reported context into an existing session
 *
 * Numeric counters are summed, string values are overwritten.
 *
 * @param sessionId - Target session ID
 * @param context - Client context data from report_session_event
 */
export async function mergeClientContext(
  sessionId: string,
  context: ClientContextInput
): Promise<void> {
  try {
    // Build merge expression: sum numerics, overwrite strings
    const mergeFields: string[] = []

    if (context.promptCount !== undefined) {
      mergeFields.push(`'promptCount', to_jsonb(COALESCE((existing->>'promptCount')::int, 0) + ${context.promptCount})`)
    }
    if (context.suggestionsShown !== undefined) {
      mergeFields.push(`'suggestionsShown', to_jsonb(COALESCE((existing->>'suggestionsShown')::int, 0) + ${context.suggestionsShown})`)
    }
    if (context.suggestionsUsed !== undefined) {
      mergeFields.push(`'suggestionsUsed', to_jsonb(COALESCE((existing->>'suggestionsUsed')::int, 0) + ${context.suggestionsUsed})`)
    }
    if (context.skippedSearches !== undefined) {
      mergeFields.push(`'skippedSearches', to_jsonb(COALESCE((existing->>'skippedSearches')::int, 0) + ${context.skippedSearches})`)
    }
    if (context.sessionEndReason !== undefined) {
      mergeFields.push(`'sessionEndReason', to_jsonb('${context.sessionEndReason}'::text)`)
    }
    if (context.pluginVersion !== undefined) {
      mergeFields.push(`'pluginVersion', to_jsonb('${context.pluginVersion}'::text)`)
    }
    if (mergeFields.length === 0) return

    const buildExpression = mergeFields.map(f => `jsonb_build_object(${f})`).join(' || ')

    await db.execute(sql`
      UPDATE mcp_sessions
      SET client_context = (
        SELECT COALESCE(client_context, '{}'::jsonb) || ${sql.raw(buildExpression)}
        FROM (SELECT COALESCE(client_context, '{}'::jsonb) AS existing FROM mcp_sessions WHERE session_id = ${sessionId}) sub
      ),
      updated_at = NOW()
      WHERE session_id = ${sessionId}
    `)

    log.debug('Client context merged', { sessionId })
  } catch (error) {
    log.error('Failed to merge client context', error, { sessionId })
  }
}
