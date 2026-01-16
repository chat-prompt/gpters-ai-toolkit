/**
 * OAuth 2.0 Authorization Server Metadata Endpoint
 *
 * Publishes OAuth server metadata per RFC 8414 for client discovery.
 * Required for MCP OAuth 2.1 support with Claude Code integration.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8414
 */
import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/utils/config'

export async function GET() {
  const BASE_URL = getBaseUrl()
  return NextResponse.json(
    {
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/oauth/authorize`,
      token_endpoint: `${BASE_URL}/oauth/token`,
      registration_endpoint: `${BASE_URL}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'], // PKCE required, S256 only
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      service_documentation: `${BASE_URL}/docs/mcp-oauth`,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  )
}
