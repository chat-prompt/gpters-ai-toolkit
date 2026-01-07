/**
 * OAuth 2.1 Authorization Endpoint
 *
 * Handles the authorization code grant flow with PKCE support.
 * Validates client, redirect URI, and creates authorization codes
 * for authenticated users per RFC 6749 and OAuth 2.1 spec.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07#section-4.1.1
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getClient, createAuthCode } from '@/lib/security/oauth'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('oauth-authorize')

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-ai-toolkit.vercel.app'

// OAuth 2.1 Authorization Endpoint
// https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07#section-4.1.1

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Extract OAuth parameters
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const responseType = searchParams.get('response_type')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')
  const state = searchParams.get('state')
  const scope = searchParams.get('scope')

  // Validate required parameters
  if (!clientId) {
    return oauthError('invalid_request', 'client_id is required')
  }

  if (!redirectUri) {
    return oauthError('invalid_request', 'redirect_uri is required')
  }

  if (responseType !== 'code') {
    return oauthError('unsupported_response_type', 'Only response_type=code is supported')
  }

  // PKCE is required for OAuth 2.1
  if (!codeChallenge) {
    return oauthError('invalid_request', 'code_challenge is required (PKCE)')
  }

  if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
    return oauthError('invalid_request', 'Only code_challenge_method=S256 is supported')
  }

  // Validate client
  const client = await getClient(clientId)
  if (!client) {
    return oauthError('invalid_client', 'Unknown client_id')
  }

  // Validate redirect_uri (exact match required)
  if (!client.redirectUris.includes(redirectUri)) {
    log.warn('Invalid redirect_uri', {
      clientId,
      redirectUri,
      registered: client.redirectUris,
    })
    return oauthError('invalid_request', 'redirect_uri does not match registered URIs')
  }

  // Check user session
  const session = await auth()

  if (!session?.user?.email) {
    // Not logged in - redirect to signin with callback
    const callbackUrl = request.nextUrl.toString()
    const signinUrl = new URL('/auth/signin', BASE_URL)
    signinUrl.searchParams.set('callbackUrl', callbackUrl)

    log.info('Redirecting to signin for OAuth authorization', { clientId })
    return NextResponse.redirect(signinUrl.toString())
  }

  // User is logged in - get database user ID
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email))

  if (!dbUser) {
    log.error('User not found in database', { email: session.user.email })
    return oauthError('server_error', 'User not found')
  }

  // Create authorization code
  try {
    const code = await createAuthCode({
      clientId,
      userId: dbUser.id,
      codeChallenge,
      codeChallengeMethod: codeChallengeMethod || 'S256',
      redirectUri,
      scope: scope || undefined,
    })

    // Redirect to client with authorization code
    const callbackUrl = new URL(redirectUri)
    callbackUrl.searchParams.set('code', code)
    if (state) {
      callbackUrl.searchParams.set('state', state)
    }

    log.info('Authorization code issued', {
      clientId,
      userId: dbUser.id,
      hasState: !!state,
    })

    return NextResponse.redirect(callbackUrl.toString())
  } catch (error) {
    log.error('Failed to create authorization code', error)

    // Redirect to client with error
    const errorUrl = new URL(redirectUri)
    errorUrl.searchParams.set('error', 'server_error')
    errorUrl.searchParams.set('error_description', 'Failed to create authorization code')
    if (state) {
      errorUrl.searchParams.set('state', state)
    }

    return NextResponse.redirect(errorUrl.toString())
  }
}

// Helper to return OAuth errors
function oauthError(error: string, description: string): NextResponse {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    { status: 400 }
  )
}
