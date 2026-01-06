import { NextResponse } from 'next/server'

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
// Claude Code attempts OAuth discovery before falling back to Bearer token auth
// Return 404 with proper JSON to indicate OAuth is not supported

export async function GET() {
  return NextResponse.json(
    {
      error: 'oauth_not_supported',
      error_description: 'This MCP server uses Bearer token authentication. OAuth is not supported.',
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
