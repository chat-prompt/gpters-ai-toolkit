import { NextRequest, NextResponse } from 'next/server'
import { getAuthCode, consumeAuthCode, verifyPkce, getClient, verifyClientSecret } from '@/lib/security/oauth'
import { createToken } from '@/lib/security/mcp-auth'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('oauth-token')

// OAuth 2.1 Token Endpoint
// https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07#section-4.1.3

export async function POST(request: NextRequest) {
  try {
    // Parse form data (application/x-www-form-urlencoded)
    const formData = await request.formData()

    const grantType = formData.get('grant_type') as string | null
    const code = formData.get('code') as string | null
    const redirectUri = formData.get('redirect_uri') as string | null
    const clientId = formData.get('client_id') as string | null
    const clientSecret = formData.get('client_secret') as string | null
    const codeVerifier = formData.get('code_verifier') as string | null

    // Validate grant_type
    if (grantType !== 'authorization_code') {
      return tokenError('unsupported_grant_type', 'Only grant_type=authorization_code is supported')
    }

    // Validate required parameters
    if (!code) {
      return tokenError('invalid_request', 'code is required')
    }

    if (!clientId) {
      return tokenError('invalid_request', 'client_id is required')
    }

    if (!codeVerifier) {
      return tokenError('invalid_request', 'code_verifier is required (PKCE)')
    }

    // Get the authorization code
    const authCode = await getAuthCode(code)
    if (!authCode) {
      log.warn('Invalid or expired authorization code', { code: code.substring(0, 8) + '...' })
      return tokenError('invalid_grant', 'Invalid or expired authorization code')
    }

    // Verify client_id matches
    if (authCode.clientId !== clientId) {
      log.warn('Client ID mismatch', {
        expected: authCode.clientId,
        received: clientId,
      })
      return tokenError('invalid_grant', 'client_id does not match')
    }

    // Verify redirect_uri matches (if provided)
    if (redirectUri && authCode.redirectUri !== redirectUri) {
      log.warn('Redirect URI mismatch', {
        expected: authCode.redirectUri,
        received: redirectUri,
      })
      return tokenError('invalid_grant', 'redirect_uri does not match')
    }

    // Verify client secret if provided (for confidential clients)
    if (clientSecret) {
      const client = await getClient(clientId)
      if (client?.secretHash) {
        const secretValid = await verifyClientSecret(clientId, clientSecret)
        if (!secretValid) {
          log.warn('Invalid client secret', { clientId })
          return tokenError('invalid_client', 'Invalid client credentials')
        }
      }
    }

    // Verify PKCE
    const pkceValid = await verifyPkce(
      codeVerifier,
      authCode.codeChallenge,
      authCode.codeChallengeMethod
    )

    if (!pkceValid) {
      log.warn('PKCE verification failed', {
        clientId,
        method: authCode.codeChallengeMethod,
      })
      return tokenError('invalid_grant', 'PKCE verification failed')
    }

    // Consume the authorization code (single use)
    await consumeAuthCode(code)

    // Create MCP token
    const client = await getClient(clientId)
    const tokenResult = await createToken({
      name: `OAuth: ${client?.name || clientId}`,
      description: `OAuth token for ${client?.name || clientId}`,
      createdBy: authCode.userId,
      // No expiration - user can revoke manually
      expiresAt: undefined,
      rateLimit: 100,
    })

    log.info('Access token issued via OAuth', {
      clientId,
      userId: authCode.userId,
      tokenId: tokenResult.id,
    })

    // Return the access token
    return NextResponse.json(
      {
        access_token: tokenResult.token,
        token_type: 'Bearer',
        // Set very long expiration (10 years in seconds)
        // Claude Code requires expires_in to be set
        expires_in: 315360000,
        scope: authCode.scope || undefined,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        },
      }
    )
  } catch (error) {
    log.error('Token exchange failed', error)
    return tokenError('server_error', 'Failed to exchange token')
  }
}

// Helper to return token errors
function tokenError(error: string, description: string): NextResponse {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    {
      status: 400,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    }
  )
}
