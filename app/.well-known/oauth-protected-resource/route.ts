/**
 * OAuth 2.0 Protected Resource Metadata Endpoint
 *
 * Publishes protected resource metadata per RFC 9449.
 * Indicates the authorization server for the MCP API resource.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9449
 */
import { NextResponse } from 'next/server'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-ai-toolkit.vercel.app'

export async function GET() {
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
      },
    }
  )
}
