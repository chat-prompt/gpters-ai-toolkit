import { NextRequest, NextResponse } from 'next/server'
import { registerClient } from '@/lib/security/oauth'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('oauth-register')

// Dynamic Client Registration (RFC 7591)
// https://datatracker.ietf.org/doc/html/rfc7591

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    const clientName = body.client_name
    const redirectUris = body.redirect_uris

    if (!clientName || typeof clientName !== 'string') {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'client_name is required',
        },
        { status: 400 }
      )
    }

    if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'redirect_uris is required and must be a non-empty array',
        },
        { status: 400 }
      )
    }

    // Validate redirect URIs format
    for (const uri of redirectUris) {
      try {
        const url = new URL(uri)
        // Allow localhost for development, require https otherwise
        if (url.protocol !== 'https:' && !url.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
          return NextResponse.json(
            {
              error: 'invalid_redirect_uri',
              error_description: `redirect_uri must use https (except localhost): ${uri}`,
            },
            { status: 400 }
          )
        }
      } catch {
        return NextResponse.json(
          {
            error: 'invalid_redirect_uri',
            error_description: `Invalid redirect_uri format: ${uri}`,
          },
          { status: 400 }
        )
      }
    }

    // Register the client
    const result = await registerClient({
      clientName,
      redirectUris,
    })

    log.info('Client registered via dynamic registration', {
      clientId: result.clientId,
      clientName: result.clientName,
    })

    // Return client credentials
    // Note: client_secret is only returned once, cannot be retrieved later
    return NextResponse.json(
      {
        client_id: result.clientId,
        client_secret: result.clientSecret,
        client_name: result.clientName,
        redirect_uris: result.redirectUris,
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    log.error('Client registration failed', error)
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Failed to register client',
      },
      { status: 500 }
    )
  }
}
