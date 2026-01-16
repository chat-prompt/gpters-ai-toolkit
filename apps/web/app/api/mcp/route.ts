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
  type AuditResponseStatus,
} from '@/lib/security/mcp-audit'

// Force dynamic rendering - never cache this route
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// CORS and cache headers for cross-origin requests
// Cache-Control: no-store prevents Vercel edge caching to avoid stale HTML responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

// In-memory session store (for serverless, consider using Redis/KV in production)
const sessions = new Map<string, { createdAt: number; lastAccess: number }>()

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
  sessions.set(newSessionId, { createdAt: Date.now(), lastAccess: Date.now() })
  return newSessionId
}

/**
 * Clean up expired sessions (called periodically)
 */
function cleanupSessions() {
  const now = Date.now()
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastAccess > SESSION_TIMEOUT) {
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
 * Handle authentication and rate limiting
 * Returns error response if auth/rate limit fails, null otherwise
 */
async function handleAuthAndRateLimit(
  request: NextRequest
): Promise<{ error?: NextResponse; auth?: OAuthAuthResult; auditCtx?: AuditContext }> {
  // Check OAuth authentication (required)
  const authResult = await withOAuthAuth(request, { requireAuth: true })

  if (authResult.error) {
    return { error: addCorsHeaders(authResult.error) }
  }

  // Create audit context for logging
  const auditCtx = await createAuditContext(request, authResult.auth)

  // If authenticated with token, token-based rate limiting is already applied
  // If not authenticated, apply IP-based rate limiting
  if (!authResult.auth) {
    const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
    if (rateLimitError) {
      // Log rate limit event
      await logRateLimitEvent(request, authResult.auth)
      return { error: addCorsHeaders(rateLimitError), auditCtx }
    }
  }

  return { auth: authResult.auth, auditCtx }
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

  if (sessions.has(sessionId)) {
    sessions.delete(sessionId)
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  return new NextResponse('Session not found', {
    status: 404,
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
    } else if (typeof value === 'string' && value.length > 100) {
      masked[key] = value.substring(0, 100) + '...'
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
  const { error, auth, auditCtx } = await handleAuthAndRateLimit(request)
  if (error) return error

  // Extract userId and userRole from authentication for ownership-based operations
  const userId = auth?.userId
  const userRole = auth?.userRole

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

  // Helper to log audit entry
  const logAudit = async (
    method: string,
    tool: string | undefined,
    status: AuditResponseStatus,
    body?: unknown,
    errorInfo?: { code?: string; message?: string }
  ) => {
    if (!auditCtx) return

    await logMcpRequest({
      method,
      tool,
      ...auditCtx,
      requestParams: maskRequestBody(body),
      responseStatus: status,
      responseTime: Date.now() - startTime,
      errorCode: errorInfo?.code,
      errorMessage: errorInfo?.message,
    })
  }

  try {
    // Check request size
    const contentLength = request.headers.get('content-length')
    if (!isRequestSizeValid(contentLength ? parseInt(contentLength, 10) : null)) {
      await logAudit('size_check', undefined, 'error', undefined, {
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
      await logAudit('invalid_action', undefined, 'error', undefined, {
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
        case 'tools':
          // No validation needed for tools
          validationResult = { success: true, data: body }
          break
        default:
          await logAudit(`rest:${action}`, undefined, 'error', body, {
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
        await logAudit(`rest:${action}`, undefined, 'error', body, {
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

      const result = await handleSimpleRequest(action, validationResult.data || body, userId, userRole)

      // Log the request
      await logAudit(
        `rest:${action}`,
        undefined,
        result.success ? 'success' : 'error',
        body,
        result.success ? undefined : { code: 'REQUEST_FAILED', message: result.error }
      )

      return NextResponse.json(result, {
        status: result.success ? 200 : 400,
        headers: corsHeaders,
      })
    }

    // JSON-RPC 2.0 mode (MCP protocol)
    const rpcValidation = validateJsonRpcRequest(body)
    if (!rpcValidation.success) {
      const rpcError = rpcValidation.error
      await logAudit('jsonrpc', extractToolFromBody(body), 'error', body, {
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
    const response = await handleHttpRequest(body, userId, userRole)

    // Handle notifications (null response means no response should be sent)
    // Per JSON-RPC 2.0 spec and MCP: notifications don't expect a response
    if (response === null) {
      await logAudit(`jsonrpc:${rpcMethod}`, tool, 'success', body)
      // Return 202 Accepted for notifications (no body)
      return new NextResponse(null, {
        status: 202,
        headers: corsHeaders,
      })
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

    await logAudit(
      `jsonrpc:${rpcMethod}`,
      tool,
      hasError ? 'error' : 'success',
      body,
      errorInfo
    )

    // Handle session for Streamable HTTP transport
    let sessionId = incomingSessionId

    // Create new session on initialize method
    if (rpcMethod === 'initialize' && !hasError) {
      sessionId = getOrCreateSession(null)
    } else if (incomingSessionId) {
      // In serverless environment, session validation is relaxed
      // because each instance has its own memory
      // Just accept the session ID without strict validation
      sessionId = incomingSessionId
    }

    // Return response with session header
    const jsonResponse = NextResponse.json(response, { headers: corsHeaders })
    return addSessionHeaders(jsonResponse, sessionId || undefined)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Log the parse error
    await logAudit('parse_error', undefined, 'error', undefined, {
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
