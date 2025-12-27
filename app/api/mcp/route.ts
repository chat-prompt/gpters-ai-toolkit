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
import { withRateLimit, RateLimitPresets } from '@/lib/rate-limit'
import { withMcpAuth, type McpAuthResult } from '@/lib/mcp-auth'

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
 * Handle authentication and rate limiting
 * Returns error response if auth/rate limit fails, null otherwise
 */
async function handleAuthAndRateLimit(
  request: NextRequest
): Promise<{ error?: NextResponse; auth?: McpAuthResult }> {
  // Check MCP token authentication
  const authResult = await withMcpAuth(request, { requireAuth: false })

  if (authResult.error) {
    return { error: addCorsHeaders(authResult.error) }
  }

  // If authenticated with token, token-based rate limiting is already applied
  // If not authenticated, apply IP-based rate limiting
  if (!authResult.auth) {
    const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
    if (rateLimitError) {
      return { error: addCorsHeaders(rateLimitError) }
    }
  }

  return { auth: authResult.auth }
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
 * POST - Handle MCP requests
 */
export async function POST(request: NextRequest) {
  // Handle auth and rate limiting
  const { error } = await handleAuthAndRateLimit(request)
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    const body = await request.json()

    // Simple REST mode (action parameter)
    if (action) {
      const result = await handleSimpleRequest(action, body)
      return NextResponse.json(result, {
        status: result.success ? 200 : 400,
        headers: corsHeaders,
      })
    }

    // JSON-RPC 2.0 mode (MCP protocol)
    const response = await handleHttpRequest(body)
    return NextResponse.json(response, { headers: corsHeaders })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

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
