/**
 * MCP Server HTTP Endpoint
 *
 * This endpoint provides two modes:
 *
 * 1. JSON-RPC 2.0 Mode (MCP Protocol):
 *    POST /api/mcp
 *    Content-Type: application/json
 *    Body: {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
 *
 * 2. Simple REST Mode:
 *    POST /api/mcp?action=search
 *    Body: {"query": "database"}
 *
 *    Actions: search, get, list, tools
 *
 * Authentication:
 *    Optional Bearer token authentication via Authorization header.
 *    When a valid token is provided, per-token rate limiting applies.
 *    Without authentication, standard IP-based rate limiting applies.
 *
 *    Example: Authorization: Bearer mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleHttpRequest, handleSimpleRequest, SERVER_INFO, MARKETPLACE_TOOLS } from '@/lib/mcp'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { withMcpAuth, type McpAuthResult } from '@/lib/security/mcp-auth'
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

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
): Promise<{ error?: NextResponse; auth?: McpAuthResult; auditCtx?: AuditContext }> {
  // Check MCP token authentication
  const authResult = await withMcpAuth(request, { requireAuth: false })

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
 * GET - Server info and available tools
 */
export async function GET(request: NextRequest) {
  // Handle auth and rate limiting
  const { error, auth } = await handleAuthAndRateLimit(request)
  if (error) return error

  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format')

  // If format=mcp, return MCP-compatible server info
  if (format === 'mcp') {
    return NextResponse.json(
      {
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        description: SERVER_INFO.description,
        tools: MARKETPLACE_TOOLS.map((t) => ({
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
        'POST /api/mcp': 'JSON-RPC 2.0 MCP endpoint',
        'POST /api/mcp?action=search': 'Search plugins (query, category, limit)',
        'POST /api/mcp?action=get': 'Get plugin content (pluginId)',
        'POST /api/mcp?action=list': 'List all plugins (category)',
        'POST /api/mcp?action=tools': 'List available tools',
      },
      tools: MARKETPLACE_TOOLS.map((t) => ({
        name: t.name,
        description: t.description.split('\n')[0],
      })),
      authentication: {
        status: auth ? 'authenticated' : 'public',
        tokenName: auth?.tokenName,
        usage: 'Add "Authorization: Bearer mcp_xxx" header for token-based access',
      },
    },
    { headers: corsHeaders }
  )
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
 * POST - Handle MCP requests
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Handle auth and rate limiting
  const { error, auditCtx } = await handleAuthAndRateLimit(request)
  if (error) return error

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

      const result = await handleSimpleRequest(action, validationResult.data || body)

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
    const response = await handleHttpRequest(body)

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

    return NextResponse.json(response, { headers: corsHeaders })
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
