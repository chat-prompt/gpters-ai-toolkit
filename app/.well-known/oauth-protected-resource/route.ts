import { NextResponse } from 'next/server'

// OAuth 2.0 Protected Resource Metadata (RFC 9449)
// Claude Code checks this endpoint to determine auth method
// Return 404 JSON to indicate Bearer token auth should be used

export async function GET() {
  return NextResponse.json(
    {
      error: 'oauth_not_supported',
      error_description: 'This MCP server uses Bearer token authentication. Include Authorization: Bearer <token> header.',
    },
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  )
}
