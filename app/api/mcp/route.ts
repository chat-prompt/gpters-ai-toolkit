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
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleHttpRequest, handleSimpleRequest, SERVER_INFO, MARKETPLACE_TOOLS } from '@/lib/mcp'
import { withRateLimit, RateLimitPresets } from '@/lib/rate-limit'

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
 * GET - Server info and available tools
 */
export async function GET(request: NextRequest) {
  // Rate limit: 100 requests per minute for info queries
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) {
    // Add CORS headers to rate limit response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      rateLimitError.headers.set(key, value)
    })
    return rateLimitError
  }

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
    },
    { headers: corsHeaders }
  )
}

/**
 * POST - Handle MCP requests
 */
export async function POST(request: NextRequest) {
  // Rate limit: 100 requests per minute for MCP operations
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) {
    // Add CORS headers to rate limit response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      rateLimitError.headers.set(key, value)
    })
    return rateLimitError
  }

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
