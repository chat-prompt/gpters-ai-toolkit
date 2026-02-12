/**
 * OAuth 2.0 Protected Resource Metadata Endpoint
 *
 * Publishes protected resource metadata per RFC 9449.
 * Indicates the authorization server for the MCP API resource.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9449
 */
import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/utils/config'

/** CORS headers for cross-origin MCP SDK access */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * Handle CORS preflight requests
 *
 * @returns 204 response with CORS headers
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET() {
  const BASE_URL = getBaseUrl()
  return NextResponse.json(
    {
      resource: `${BASE_URL}/api/mcp`,
      authorization_servers: [BASE_URL],
      bearer_methods_supported: ['header'],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        ...corsHeaders,
      },
    }
  )
}
