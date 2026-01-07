import { NextResponse } from 'next/server'

// OAuth 2.0 Protected Resource Metadata (RFC 9449)
// Indicates where the authorization server metadata can be found

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
