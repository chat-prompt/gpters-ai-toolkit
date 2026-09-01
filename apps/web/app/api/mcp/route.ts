/**
 * MCP Server HTTP Endpoint (Streamable HTTP Transport)
 *
 * Implements MCP 2025-03-26 Streamable HTTP transport specification.
 *
 * Transport modes:
 *
 * 1. POST /api/mcp - JSON-RPC 2.0 requests
 *    Content-Type: application/json
 *    Body: {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
 *    Response: JSON or SSE stream (based on Accept header)
 *
 * 2. GET /api/mcp - SSE stream for server-to-client notifications
 *    Accept: text/event-stream
 *    Response: Server-Sent Events stream
 *
 * 3. DELETE /api/mcp - Close session
 *    Mcp-Session-Id: <session-id>
 *
 * Session Management:
 *    Server returns Mcp-Session-Id header on initialize.
 *    Client must include this header in subsequent requests.
 *
 * Simple REST Mode (legacy):
 *    POST /api/mcp?action=search
 *    Body: {"query": "database"}
 *
 * Authentication:
 *    OAuth 2.1 authentication via Authorization header.
 *    Use: claude mcp add gpters-ai-toolkit https://[host]/api/mcp -t http
 */

import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { handleHttpRequest, handleSimpleRequest, SERVER_INFO, MCP_TOOLS } from '@/lib/mcp'
import { withRateLimit, RateLimitPresets, getMcpCommand } from '@/lib/utils'
import { withOAuthAuth, type OAuthAuthResult } from '@/lib/security/oauth-tokens'
import {
  MAX_REQUEST_SIZE,
  isRequestSizeValid,
  validateSearchRequest,
  validateGetRequest,
  validateListRequest,
  validateJsonRpcRequest,
  createValidationError,
  createJsonRpcValidationError,
  containsDangerousPatterns,
} from '@/lib/security/mcp-validation'
import {
  createAuditContext,
  logMcpRequest,
  logRateLimitEvent,
  inferReferralSource,
  type AuditResponseStatus,
} from '@/lib/security/mcp-audit'
import type { ToolExecutionMeta } from '@/lib/mcp'
import {
  upsertSessionSummary,
  mergeClientContext,
  mapToolToAction,
  extractSkillId,
  extractSearchQuery,
  recordSearchEvents,
  recordLoadEvent,
  recordOutcomeEvent,
  recordAutoSkipEvents,
  recordSearchSkipEvent,
  recordDeployEvent,
  recordSkillExecutionAttempt,
  recordSkillExecutionStart,
  finalizeSession,
} from '@/lib/analytics'
import {
  resolveClientType,
  extractClientInfo,
  type ClientType,
} from '@/lib/security/client-type'
import { db, orgMemberships, mcpSessions, users as usersTable, organizations } from '@gpters/db'
import { and, eq } from 'drizzle-orm'

// Force dynamic rendering - never cache this route
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// CORS and cache headers for cross-origin requests
// Cache-Control: no-store prevents Vercel edge caching to avoid stale HTML responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, X-Analytics-Opt-Out',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

/**
 * In-memory session state for MCP connections
 *
 * Tracks client info and skill interaction for outcome auto-reporting.
 */
interface InMemorySession {
  createdAt: number
  lastAccess: number
  clientType?: ClientType
  clientName?: string
  clientVersion?: string
  /** Skill IDs loaded via get_plugin_content during this session */
  loadedSkills: Set<string>
  /** Skill IDs explicitly reported via report_skill_outcome */
  reportedSkills: Set<string>
  /** Authenticated user ID (for auto-skip event recording) */
  userId?: string
}

// In-memory session store (for serverless, consider using Redis/KV in production)
const sessions = new Map<string, InMemorySession>()

// Session timeout (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000

/**
 * Generate a new session ID
 */
function generateSessionId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Validate and refresh session
 */
function _validateSession(sessionId: string | null): boolean {
  if (!sessionId) return true // New session allowed

  const session = sessions.get(sessionId)
  if (!session) return false

  const now = Date.now()
  if (now - session.lastAccess > SESSION_TIMEOUT) {
    sessions.delete(sessionId)
    return false
  }

  session.lastAccess = now
  return true
}

/**
 * Create or get session
 */
function getOrCreateSession(sessionId: string | null): string {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!
    session.lastAccess = Date.now()
    return sessionId
  }

  const newSessionId = generateSessionId()
  sessions.set(newSessionId, {
    createdAt: Date.now(),
    lastAccess: Date.now(),
    loadedSkills: new Set(),
    reportedSkills: new Set(),
  })
  return newSessionId
}

/**
 * Flush auto-skip events for a single in-memory session
 *
 * Delegates to the shared recordAutoSkipEvents from analytics library.
 *
 * @param sessionId - MCP session ID
 * @param session - In-memory session state
 */
async function flushAutoSkipForSession(sessionId: string, session: InMemorySession): Promise<void> {
  await recordAutoSkipEvents({
    sessionId,
    userId: session.userId,
    loadedSkillIds: [...session.loadedSkills],
    reportedSkillIds: [...session.reportedSkills],
  })
}

/**
 * Clean up expired sessions (called periodically)
 *
 * Records auto-skip events for unreported skills before removing sessions.
 */
function cleanupSessions() {
  const now = Date.now()
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastAccess > SESSION_TIMEOUT) {
      // Fire-and-forget: record auto-skip events before removing session
      flushAutoSkipForSession(id, session).catch(() => {})
      sessions.delete(id)
    }
  }
}

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/**
 * Audit context for tracking request metadata
 */
interface AuditContext {
  ipHash: string
  userAgent?: string
  isAuthenticated: boolean
  tokenId?: string
}

/**
 * Get user's current organization ID from database
 * Returns the first org membership found for the user
 */
async function getUserOrgId(userId: string): Promise<string | undefined> {
  try {
    const [membership] = await db
      .select({ orgId: orgMemberships.orgId })
      .from(orgMemberships)
      .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.status, 'active')))
      .limit(1)
    
    return membership?.orgId
  } catch (_error) {
    return undefined
  }
}

/**
 * Handle authentication and rate limiting
 * Returns error response if auth/rate limit fails, null otherwise
 */
async function handleAuthAndRateLimit(
  request: NextRequest
): Promise<{ error?: NextResponse; auth?: OAuthAuthResult; auditCtx?: AuditContext; initialClientType?: ClientType }> {
  // Check OAuth authentication (required)
  const authResult = await withOAuthAuth(request, { requireAuth: true })

  if (authResult.error) {
    return { error: addCorsHeaders(authResult.error) }
  }

  // Create audit context for logging
  const auditCtx = await createAuditContext(request, authResult.auth)

  // Resolve initial client type from OAuth client name and User-Agent
  const initialClientType = resolveClientType({
    oauthClientName: authResult.auth?.clientName,
    userAgent: auditCtx.userAgent,
  })

  // Apply rate limiting based on authentication status
  if (authResult.auth?.userId) {
    // Authenticated users: userId-based rate limit with role-based tier
    const isAdmin = authResult.auth.userRole === 'super_admin' || authResult.auth.userRole === 'admin'
    const preset = isAdmin ? RateLimitPresets.authenticatedAdmin : RateLimitPresets.authenticated
    const rateLimitError = withRateLimit(request, {
      ...preset,
      identifier: () => `user:${authResult.auth!.userId}`,
    })
    if (rateLimitError) {
      after(() => logRateLimitEvent(request, authResult.auth))
      return { error: addCorsHeaders(rateLimitError), auditCtx }
    }
  } else {
    // Unauthenticated: IP-based rate limiting
    const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
    if (rateLimitError) {
      after(() => logRateLimitEvent(request, authResult.auth))
      return { error: addCorsHeaders(rateLimitError), auditCtx }
    }
  }

  return { auth: authResult.auth, auditCtx, initialClientType }
}

/**
 * GET - SSE stream for server-to-client notifications (Streamable HTTP)
 *
 * When Accept: text/event-stream is present, opens an SSE connection.
 * Otherwise, returns server info as JSON.
 */
export async function GET(request: NextRequest) {
  // Handle auth and rate limiting
  const { error, auth } = await handleAuthAndRateLimit(request)
  if (error) return error

  const accept = request.headers.get('accept') || ''
  const sessionId = request.headers.get('mcp-session-id')

  // SSE stream mode (Streamable HTTP transport)
  if (accept.includes('text/event-stream')) {
    const SSE_TIMEOUT = 55000
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const connectEvent = `event: open\ndata: {"status":"connected"}\n\n`
        controller.enqueue(encoder.encode(connectEvent))

        const keepaliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'))
          } catch {
            clearInterval(keepaliveInterval)
          }
        }, 15000)

        const closeTimeout = setTimeout(() => {
          clearInterval(keepaliveInterval)
          try {
            controller.enqueue(encoder.encode('event: timeout\ndata: {"reconnect":true}\n\n'))
            controller.close()
          } catch {}
        }, SSE_TIMEOUT)

        request.signal.addEventListener('abort', () => {
          clearInterval(keepaliveInterval)
          clearTimeout(closeTimeout)
          controller.close()
        })
      },
    })

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }

    if (sessionId) {
      responseHeaders['Mcp-Session-Id'] = sessionId
    }

    return new Response(stream, { headers: responseHeaders })
  }

  // Legacy JSON mode
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format')

  // If format=mcp, return MCP-compatible server info
  if (format === 'mcp') {
    return NextResponse.json(
      {
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        description: SERVER_INFO.description,
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description.split('\n')[0],
        })),
        authenticated: !!auth,
      },
      { headers: corsHeaders }
    )
  }

  // Default: human-readable info
  return NextResponse.json(
    {
      server: SERVER_INFO,
      endpoints: {
        'GET /api/mcp': 'SSE stream (with Accept: text/event-stream) or server info',
        'POST /api/mcp': 'JSON-RPC 2.0 MCP endpoint',
        'DELETE /api/mcp': 'Close session',
        'POST /api/mcp?action=search': 'Search plugins (query, category, limit)',
        'POST /api/mcp?action=get': 'Get plugin content (pluginId)',
        'POST /api/mcp?action=list': 'List all plugins (category)',
      },
      tools: MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description.split('\n')[0],
      })),
      authentication: {
        status: auth ? 'authenticated' : 'unauthenticated',
        userId: auth?.userId,
        clientId: auth?.clientId,
        required: true,
        usage: `OAuth 2.1 authentication required. Run: ${getMcpCommand()}`,
      },
      transport: 'Streamable HTTP (MCP 2025-03-26)',
    },
    { headers: corsHeaders }
  )
}

/**
 * DELETE - Close session
 */
export async function DELETE(request: NextRequest) {
  const sessionId = request.headers.get('mcp-session-id')

  if (!sessionId) {
    return new NextResponse('Missing Mcp-Session-Id header', {
      status: 400,
      headers: corsHeaders,
    })
  }

  // Record auto-skip events for unreported skills before removing session
  const session = sessions.get(sessionId)
  sessions.delete(sessionId)
  // Always attempt DB finalization — no-op if session doesn't exist in DB
  after(async () => {
    if (session) {
      await flushAutoSkipForSession(sessionId, session).catch(() => {})
    }
    await finalizeSession(sessionId).catch(() => {})
  })
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

/**
 * Mask sensitive data in request body for audit logging
 */
function maskRequestBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined

  const masked: Record<string, unknown> = {}
  const sensitiveKeys = ['token', 'password', 'secret', 'key', 'authorization', 'credential']

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      masked[key] = '[REDACTED]'
    } else if (typeof value === 'string' && value.length > 500) {
      masked[key] = value.substring(0, 500) + '...'
    } else {
      masked[key] = value
    }
  }

  return masked
}

/**
 * Extract tool name from request body
 */
function extractToolFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined

  const rpcBody = body as Record<string, unknown>

  // JSON-RPC: tools/call method
  if (rpcBody.method === 'tools/call' && rpcBody.params) {
    const params = rpcBody.params as Record<string, unknown>
    return params.name as string | undefined
  }

  return undefined
}

/**
 * POST - Handle MCP requests (Streamable HTTP)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Handle auth and rate limiting
  const { error, auth, auditCtx, initialClientType } = await handleAuthAndRateLimit(request)
  if (error) return error

  // Extract userId and userRole from authentication for ownership-based operations
  const userId = auth?.userId
  const userRole = auth?.userRole
  
  // Get user's organization context for org-based filtering
  const orgId = userId ? await getUserOrgId(userId) : undefined

  // Session management for Streamable HTTP transport
  const incomingSessionId = request.headers.get('mcp-session-id')

  // Periodic cleanup of expired sessions
  if (Math.random() < 0.01) cleanupSessions()

  // Helper to add session headers to response
  const addSessionHeaders = (response: NextResponse, sessionId?: string): NextResponse => {
    if (sessionId) {
      response.headers.set('Mcp-Session-Id', sessionId)
    }
    return response
  }

  // Track client info across the request lifecycle (updated on initialize)
  let currentClientType: ClientType | undefined = initialClientType
  // Fallback: use OAuth client name when initialize is skipped (e.g., OpenCode direct tools/call)
  let currentClientName: string | undefined = auth?.clientName || undefined
  let currentClientVersion: string | undefined

  // Deferred session ID: updated after initialize creates a new session (line 728+)
  // after() callbacks read this at execution time, so initialize's new ID is captured
  let resolvedSessionId: string | undefined = incomingSessionId || undefined

  // Check analytics opt-out header
  const analyticsOptOut = request.headers.get('x-analytics-opt-out') === 'true'

  // Helper to log audit entry (fire-and-forget via after())
  const logAudit = (
    method: string,
    tool: string | undefined,
    status: AuditResponseStatus,
    body?: unknown,
    errorInfo?: { code?: string; message?: string },
    meta?: ToolExecutionMeta
  ) => {
    if (!auditCtx) return
    if (analyticsOptOut) return

    const responseTime = Date.now() - startTime
    // NOTE: client info and session ID are read inside after() at execution time (deferred),
    // so initialize requests will have the correct values set after session creation
    after(async () => {
      const sid = resolvedSessionId
      const ct = currentClientType
      const cn = currentClientName
      const cv = currentClientVersion
      // Determine referral source: from meta (explicit) or infer from session
      let referralSource = meta?.referralSource
      if (!referralSource && sid && tool === 'get_plugin_content') {
        const params = body && typeof body === 'object' ? (body as Record<string, unknown>).params as Record<string, unknown> | undefined : undefined
        const pluginId = params?.arguments ? (params.arguments as Record<string, unknown>).pluginId as string : undefined
        if (pluginId) {
          referralSource = await inferReferralSource(sid, pluginId)
        }
      }

      // report_session_event without session → skip audit log (noise reduction)
      // These are typically devlog hooks calling HTTP directly without MCP session
      if (tool === 'report_session_event' && !sid) {
        return
      }

      const auditLogId = await logMcpRequest({
        method,
        tool,
        ...auditCtx,
        clientType: ct,
        clientName: cn,
        clientVersion: cv,
        requestParams: maskRequestBody(body),
        responseStatus: status,
        responseTime,
        errorCode: errorInfo?.code,
        errorMessage: errorInfo?.message,
        sessionId: sid,
        searchResults: meta?.searchResults,
        referralSource,
      })

      // Session tracking: upsert session summary
      if (sid) {
        await upsertSessionSummary({
          sessionId: sid,
          userId: auth?.userId,
          accessTokenId: auditCtx?.tokenId,
          clientType: ct,
          clientName: cn,
          clientVersion: cv,
          ipHash: auditCtx?.ipHash,
          tool,
          method,
          responseStatus: status,
          responseTime,
          skillId: extractSkillId(body, tool),
          searchQuery: extractSearchQuery(body, tool),
          action: mapToolToAction(tool),
        }).catch(() => {})

        // Handle client session events (report_session_event tool)
        if (meta?.sessionEvent) {
          const evt = meta.sessionEvent
          await mergeClientContext(sid, {
            promptCount: evt.promptCount,
            suggestionsShown: evt.suggestionsShown,
            suggestionsUsed: evt.suggestionsUsed,
            skippedSearches: evt.skippedSearches,
            sessionEndReason: evt.sessionEndReason,
            pluginVersion: evt.pluginVersion,
          }).catch(() => {})

          if (evt.eventType === 'session_end') {
            await finalizeSession(sid).catch(() => {})
          }
        }

        // Handle search skip reports
        if (meta?.searchSkip) {
          await upsertSessionSummary({
            sessionId: sid,
            userId: auth?.userId,
            accessTokenId: auditCtx?.tokenId,
            clientType: ct,
            clientName: cn,
            tool: 'report_search_skip',
            action: 'other',
            responseStatus: 'success',
            searchQuery: meta.searchSkip.query,
          }).catch(() => {})
        }

        // Handle skill outcome reports
        if (meta?.skillOutcome) {
          await upsertSessionSummary({
            sessionId: sid,
            userId: auth?.userId,
            accessTokenId: auditCtx?.tokenId,
            clientType: ct,
            clientName: cn,
            tool: 'report_skill_outcome',
            action: meta.skillOutcome.applied ? 'deploy' : 'other',
            responseStatus: 'success',
            skillId: meta.skillOutcome.skillId,
          }).catch(() => {})
        }

      }

      // 실행 보고는 transport session과 독립적인 사건이다. 단발 CLI도 저장한다.
      if (meta?.skillExecutionStart) {
        await recordSkillExecutionStart({
          sessionId: sid ?? null,
          userId: auth?.userId,
          report: meta.skillExecutionStart,
        }).catch(() => {})
      }

      if (meta?.skillExecution) {
        const firstCompletion = await recordSkillExecutionAttempt({
          sessionId: sid ?? null,
          userId: auth?.userId,
          report: meta.skillExecution,
        }).catch(() => false)

        // 실패·부분 성공도 스킬을 실제로 적용한 시도이므로 apply로 기록한다.
        // 동일 attemptId의 재보고는 eventId가 달라도 파생 apply를 한 번만 반영한다.
        if (firstCompletion) {
          await recordOutcomeEvent({
            sessionId: sid ?? null,
            sourceAuditLogId: auditLogId ?? undefined,
            journeyId: meta.skillExecution.journeyId,
            userId: auth?.userId,
            skillId: meta.skillExecution.skillId,
            applied: true,
            summary: meta.skillExecution.validation.summary ?? `execution:${meta.skillExecution.status}`,
          }).catch(() => {})
        }

        const sess = sid ? sessions.get(sid) : undefined
        if (sess) sess.reportedSkills.add(meta.skillExecution.skillId)
      }

      // ── Normalized skill_events recording ──
      // 단발성 AITK CLI는 정식 MCP 세션이 없어도 성공 사건 자체는 보존한다.
      // session_id=NULL은 세션·퍼널에서는 빠지고, 사건·사용자 집계에는 포함된다.
      if (status === 'success' && auditLogId) {
        // Record search events including zero-result searches for accurate metrics
        if (meta?.searchResults !== undefined) {
          await recordSearchEvents({
            sessionId: sid ?? null,
            sourceAuditLogId: auditLogId,
            journeyId: meta.journeyId ?? null,
            userId: auth?.userId,
            query: extractSearchQuery(body, tool) ?? '',
            results: meta.searchResults ?? [],
          }).catch(() => {})
        }

        if (tool === 'get_plugin_content') {
          const skillId = extractSkillId(body, tool)
          if (skillId) {
            await recordLoadEvent({
              sessionId: sid ?? null,
              sourceAuditLogId: auditLogId,
              journeyId: meta?.journeyId ?? null,
              userId: auth?.userId,
              skillId,
            }).catch(() => {})

            // Track loaded skill in session for auto-skip on session end
            const sess = sid ? sessions.get(sid) : undefined
            if (sess) {
              sess.loadedSkills.add(skillId)
              sess.userId = auth?.userId
            }
          }
        }

        if (meta?.skillOutcome) {
          await recordOutcomeEvent({
            sessionId: sid ?? null,
            sourceAuditLogId: auditLogId,
            journeyId: meta.skillOutcome.journeyId,
            userId: auth?.userId,
            skillId: meta.skillOutcome.skillId,
            applied: meta.skillOutcome.applied,
            summary: meta.skillOutcome.summary,
          }).catch(() => {})

          // Track reported skill in session to exclude from auto-skip
          const sess = sid ? sessions.get(sid) : undefined
          if (sess) {
            sess.reportedSkills.add(meta.skillOutcome.skillId)
          }
        }

        if (meta?.searchSkip) {
          await recordSearchSkipEvent({
            sessionId: sid ?? null,
            sourceAuditLogId: auditLogId,
            userId: auth?.userId,
            query: meta.searchSkip.query,
            resultIds: meta.searchSkip.resultIds,
            reason: meta.searchSkip.reason,
          }).catch(() => {})
        }

        if (tool === 'deploy_skill') {
          const skillId = extractSkillId(body, tool)
          if (skillId) {
            await recordDeployEvent({
              sessionId: sid ?? null,
              sourceAuditLogId: auditLogId,
              userId: auth?.userId,
              skillId,
            }).catch(() => {})
          }
        }
      }
    })
  }

  try {
    // Check request size
    const contentLength = request.headers.get('content-length')
    if (!isRequestSizeValid(contentLength ? parseInt(contentLength, 10) : null)) {
      logAudit('size_check', undefined, 'error', undefined, {
        code: 'REQUEST_TOO_LARGE',
        message: `Request body too large. Maximum size is ${MAX_REQUEST_SIZE / 1024}KB`,
      })
      return addCorsHeaders(
        NextResponse.json(
          { success: false, error: `Request body too large. Maximum size is ${MAX_REQUEST_SIZE / 1024}KB` },
          { status: 413 }
        )
      )
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Validate action parameter
    if (action && containsDangerousPatterns(action)) {
      logAudit('invalid_action', undefined, 'error', undefined, {
        code: 'INVALID_ACTION',
        message: 'Invalid action parameter',
      })
      return addCorsHeaders(
        NextResponse.json(
          { success: false, error: 'Invalid action parameter' },
          { status: 400 }
        )
      )
    }

    const body = await request.json()

    // Map REST action to corresponding MCP tool name for audit logging
    const REST_ACTION_TO_TOOL: Record<string, string> = {
      get: 'get_plugin_content',
      search: 'search_plugins',
      list: 'list_plugins',
      deploy: 'deploy_skill',
    }

    // Simple REST mode (action parameter)
    if (action) {
      // Validate request body based on action
      let validationResult
      switch (action) {
        case 'search':
          validationResult = validateSearchRequest(body)
          break
        case 'get':
          validationResult = validateGetRequest(body)
          break
        case 'list':
          validationResult = validateListRequest(body)
          break
        case 'whoami': {
          // Return authenticated user info
          if (!userId) {
            return addCorsHeaders(
              NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
            )
          }
          const [userInfo] = await db
            .select({ name: usersTable.name, email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1)
          const [orgInfo] = orgId
            ? await db
                .select({ name: organizations.name })
                .from(organizations)
                .where(eq(organizations.id, orgId))
                .limit(1)
            : [undefined]
          return addCorsHeaders(
            NextResponse.json({
              success: true,
              user: {
                id: userId,
                name: userInfo?.name,
                email: userInfo?.email,
                org: orgId ? { id: orgId, name: orgInfo?.name } : null,
              },
            })
          )
        }
        case 'create':
        case 'deploy':
        case 'tools':
          // No validation needed for create/deploy/tools
          validationResult = { success: true, data: body }
          break
        default:
          logAudit(`rest:${action}`, REST_ACTION_TO_TOOL[action], 'error', body, {
            code: 'UNKNOWN_ACTION',
            message: `Unknown action: ${action}`,
          })
          return addCorsHeaders(
            NextResponse.json(
              { success: false, error: `Unknown action: ${action}` },
              { status: 400 }
            )
          )
      }

      if (!validationResult.success && 'error' in validationResult) {
        const validationError = validationResult.error
        const errorMessage = typeof validationError === 'string'
          ? validationError
          : (validationError as { message?: string })?.message || 'Validation failed'
        logAudit(`rest:${action}`, REST_ACTION_TO_TOOL[action], 'error', body, {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
        })
        return addCorsHeaders(
          NextResponse.json(
            createValidationError(validationError),
            { status: 400 }
          )
        )
      }

      const result = await handleSimpleRequest(action, validationResult.data || body, userId, userRole, orgId, currentClientType)

      logAudit(
        `rest:${action}`,
        REST_ACTION_TO_TOOL[action],
        result.success ? 'success' : 'error',
        body,
        result.success ? undefined : { code: 'REQUEST_FAILED', message: result.error },
        result.meta
      )

      // 내부 분석 메타데이터는 감사/정규화 기록에만 쓰고 REST 응답에는 노출하지 않는다.
      const { meta: _meta, ...publicResult } = result
      return NextResponse.json(publicResult, {
        status: result.success ? 200 : 400,
        headers: corsHeaders,
      })
    }

    // JSON-RPC 2.0 mode (MCP protocol)
    const rpcValidation = validateJsonRpcRequest(body)
    if (!rpcValidation.success) {
      const rpcError = rpcValidation.error
      logAudit('jsonrpc', extractToolFromBody(body), 'error', body, {
        code: 'VALIDATION_ERROR',
        message: rpcError.message || 'Validation failed',
      })
      return addCorsHeaders(
        NextResponse.json(
          createJsonRpcValidationError(body?.id, rpcError),
          { status: 400 }
        )
      )
    }

    const rpcMethod = (body as Record<string, unknown>)?.method as string
    const tool = extractToolFromBody(body)
    const response = await handleHttpRequest(body, userId, userRole, orgId, currentClientType)

    // Handle notifications (null response means no response should be sent)
    // Per JSON-RPC 2.0 spec and MCP: notifications don't expect a response
    if (response === null) {
      logAudit(`jsonrpc:${rpcMethod}`, tool, 'success', body)
      // Return 202 Accepted for notifications (no body)
      return new NextResponse(null, {
        status: 202,
        headers: corsHeaders,
      })
    }

    // Extract _meta from tool response for audit enrichment, then strip it
    let toolMeta: ToolExecutionMeta | undefined
    if (response && typeof response === 'object' && !Array.isArray(response) && 'result' in response) {
      const result = (response as unknown as Record<string, unknown>).result as Record<string, unknown> | undefined
      if (result?._meta) {
        toolMeta = result._meta as ToolExecutionMeta
        delete result._meta
      }
    }

    // Check if response contains error
    const hasError = response && typeof response === 'object' && 'error' in response

    // Extract error code if present
    let errorInfo: { code?: string; message?: string } | undefined
    if (hasError) {
      const errorObj = (response as unknown as { error?: { code?: number; message?: string } }).error
      errorInfo = {
        code: errorObj?.code !== undefined ? String(errorObj.code) : 'UNKNOWN',
        message: errorObj?.message || 'RPC error',
      }
    }

    // Extract clientInfo from initialize request for more accurate identification
    if (rpcMethod === 'initialize') {
      const mcpClientInfo = extractClientInfo(body)
      if (mcpClientInfo) {
        // Re-resolve with clientInfo for more accurate type
        const refinedType = resolveClientType({
          oauthClientName: auth?.clientName,
          clientInfo: mcpClientInfo,
          userAgent: auditCtx?.userAgent,
        })
        currentClientType = refinedType
        currentClientName = mcpClientInfo.name
        currentClientVersion = mcpClientInfo.version
      }
    }

    logAudit(
      `jsonrpc:${rpcMethod}`,
      tool,
      hasError ? 'error' : 'success',
      body,
      errorInfo,
      toolMeta
    )

    // Handle session for Streamable HTTP transport
    let sessionId = incomingSessionId

    // Create new session on initialize method
    if (rpcMethod === 'initialize' && !hasError) {
      sessionId = getOrCreateSession(null)
      // Update deferred reference so after() callbacks use the new session ID
      resolvedSessionId = sessionId

      // Cache client info in session for subsequent requests
      const session = sessions.get(sessionId)
      if (session) {
        session.clientType = currentClientType
        session.clientName = currentClientName
        session.clientVersion = currentClientVersion
      }
    } else if (incomingSessionId) {
      // In serverless environment, session validation is relaxed
      // because each instance has its own memory
      // Just accept the session ID without strict validation
      sessionId = incomingSessionId

      // Restore cached client info from session (best-effort in-memory, then DB fallback)
      const existingSession = sessions.get(incomingSessionId)
      if (existingSession?.clientType && !currentClientName) {
        currentClientType = existingSession.clientType
        currentClientName = existingSession.clientName
        currentClientVersion = existingSession.clientVersion
      } else if (!currentClientName) {
        // Serverless fallback: read client info from DB (non-blocking, best-effort)
        try {
          const [row] = await db
            .select({
              clientType: mcpSessions.clientType,
              clientName: mcpSessions.clientName,
              clientVersion: mcpSessions.clientVersion,
            })
            .from(mcpSessions)
            .where(eq(mcpSessions.sessionId, incomingSessionId))
            .limit(1)
          if (row?.clientName) {
            currentClientType = (row.clientType as ClientType) || currentClientType
            currentClientName = row.clientName
            currentClientVersion = row.clientVersion || undefined
          }
        } catch {
          // Ignore — best-effort
        }
      }
    }

    // Return response with session header
    const jsonResponse = NextResponse.json(response, { headers: corsHeaders })
    return addSessionHeaders(jsonResponse, sessionId || undefined)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logAudit('parse_error', undefined, 'error', undefined, {
      code: 'PARSE_ERROR',
      message: errorMessage,
    })

    // Check if it's a JSON-RPC request
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${errorMessage}`,
        },
      },
      {
        status: 400,
        headers: corsHeaders,
      }
    )
  }
}
