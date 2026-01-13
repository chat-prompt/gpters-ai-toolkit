/**
 * OAuth Access Token Management
 *
 * Provides secure token generation, validation for OAuth-issued access tokens.
 * Tokens are stored as SHA-256 hashes in the database for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { oauthAccessTokens, users } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('oauth-tokens')

// Token format: mcp_[32 random hex characters] (total 36 chars)
const TOKEN_PREFIX = 'mcp_'
const TOKEN_LENGTH = 32 // hex characters after prefix

/**
 * Generate a cryptographically secure random token
 * Format: mcp_[32 hex characters]
 */
export function generateToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH / 2))
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${TOKEN_PREFIX}${hexString}`
}

/**
 * Hash a token using SHA-256
 * We store the hash, never the raw token
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Validate token format
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false
  const hexPart = token.slice(TOKEN_PREFIX.length)
  if (hexPart.length !== TOKEN_LENGTH) return false
  return /^[0-9a-f]+$/i.test(hexPart)
}

/**
 * Extract bearer token from Authorization header or query parameter
 */
export function extractBearerToken(request: NextRequest): string | null {
  // First, try Authorization header
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    const parts = authHeader.split(' ')
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1]
    }
  }

  // Fallback to query parameter for clients that don't support custom headers
  const url = new URL(request.url)
  const tokenParam = url.searchParams.get('token')
  if (tokenParam) {
    return tokenParam
  }

  return null
}

// ============================================
// OAuth Access Token Types
// ============================================

export interface CreateAccessTokenOptions {
  clientId: string
  userId: string
  scope?: string
  expiresAt?: Date
}

export interface CreateAccessTokenResult {
  token: string // Raw token (only returned once)
  id: string
}

export interface AccessTokenValidationResult {
  valid: boolean
  accessTokenId?: string
  userId?: string
  clientId?: string
  scope?: string
  userRole?: string
  error?: string
}

export interface OAuthAuthResult {
  authenticated: boolean
  accessTokenId?: string
  userId?: string
  clientId?: string
  scope?: string
  userRole?: string
  error?: string
}

// ============================================
// OAuth Access Token Functions
// ============================================

/**
 * Create a new OAuth access token
 * Returns the raw token ONLY ONCE - it cannot be retrieved later
 */
export async function createAccessToken(
  options: CreateAccessTokenOptions
): Promise<CreateAccessTokenResult> {
  const rawToken = generateToken()
  const tokenHash = await hashToken(rawToken)

  const [record] = await db
    .insert(oauthAccessTokens)
    .values({
      tokenHash,
      clientId: options.clientId,
      userId: options.userId,
      scope: options.scope,
      expiresAt: options.expiresAt,
    })
    .returning({ id: oauthAccessTokens.id })

  log.info('OAuth access token created', {
    accessTokenId: record.id,
    clientId: options.clientId,
    userId: options.userId,
  })

  return {
    token: rawToken,
    id: record.id,
  }
}

/**
 * Validate an access token against the database
 * Also updates last_used_at and usage_count
 */
export async function validateAccessToken(
  token: string
): Promise<AccessTokenValidationResult> {
  // Check format first
  if (!isValidTokenFormat(token)) {
    return { valid: false, error: 'Invalid token format' }
  }

  try {
    // Hash the token
    const tokenHash = await hashToken(token)

    // Look up in database with user role (left join to handle missing user)
    const [tokenRecord] = await db
      .select({
        id: oauthAccessTokens.id,
        clientId: oauthAccessTokens.clientId,
        userId: oauthAccessTokens.userId,
        scope: oauthAccessTokens.scope,
        isActive: oauthAccessTokens.isActive,
        expiresAt: oauthAccessTokens.expiresAt,
        userRole: users.role,
      })
      .from(oauthAccessTokens)
      .leftJoin(users, eq(oauthAccessTokens.userId, users.id))
      .where(eq(oauthAccessTokens.tokenHash, tokenHash))

    if (!tokenRecord) {
      log.warn('Access token validation failed: token not found')
      return { valid: false, error: 'Invalid token' }
    }

    // Check if active
    if (!tokenRecord.isActive) {
      log.warn('Access token validation failed: token is inactive', {
        accessTokenId: tokenRecord.id,
      })
      return { valid: false, error: 'Token has been revoked' }
    }

    // Check expiration
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      log.warn('Access token validation failed: token expired', {
        accessTokenId: tokenRecord.id,
      })
      return { valid: false, error: 'Token has expired' }
    }

    // Update usage statistics (non-blocking, fire-and-forget)
    void db.update(oauthAccessTokens)
      .set({
        lastUsedAt: new Date(),
        usageCount: sql`${oauthAccessTokens.usageCount} + 1`,
      })
      .where(eq(oauthAccessTokens.id, tokenRecord.id))
      .execute()
      .catch((err) => {
        log.error('Failed to update access token usage', err)
      })

    log.debug('Access token validated successfully', {
      accessTokenId: tokenRecord.id,
      userId: tokenRecord.userId,
      clientId: tokenRecord.clientId,
      userRole: tokenRecord.userRole,
    })

    return {
      valid: true,
      accessTokenId: tokenRecord.id,
      userId: tokenRecord.userId,
      clientId: tokenRecord.clientId,
      scope: tokenRecord.scope ?? undefined,
      userRole: tokenRecord.userRole ?? undefined,
    }
  } catch (error) {
    log.error('Access token validation error', error)
    return { valid: false, error: 'Token validation failed' }
  }
}

/**
 * Authenticate OAuth request
 * Returns auth result or null if no auth header (public mode)
 */
export async function authenticateOAuthRequest(
  request: NextRequest
): Promise<OAuthAuthResult | null> {
  const token = extractBearerToken(request)

  // No auth header = public mode (return null to let caller decide)
  if (!token) {
    return null
  }

  const result = await validateAccessToken(token)

  if (!result.valid) {
    return {
      authenticated: false,
      error: result.error,
    }
  }

  return {
    authenticated: true,
    accessTokenId: result.accessTokenId,
    userId: result.userId,
    clientId: result.clientId,
    scope: result.scope,
    userRole: result.userRole,
  }
}

/**
 * Create OAuth authentication error response
 * For 401 responses, includes WWW-Authenticate header for OAuth discovery
 */
export function oauthAuthError(message: string, status: 401 | 403 = 401): NextResponse {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://company-ai-toolkit.vercel.app'

  const headers: Record<string, string> = {}

  // RFC 6750: Include WWW-Authenticate header for 401 responses
  // This enables OAuth 2.1 discovery for MCP clients
  if (status === 401) {
    headers['WWW-Authenticate'] = `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
  }

  return NextResponse.json(
    {
      error: message,
      code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
    },
    { status, headers }
  )
}

/**
 * Middleware helper for OAuth authentication
 * Supports both authenticated and public modes based on configuration
 */
export async function withOAuthAuth(
  request: NextRequest,
  options: { requireAuth?: boolean } = {}
): Promise<{ error?: NextResponse; auth?: OAuthAuthResult }> {
  const authResult = await authenticateOAuthRequest(request)

  // No auth header provided
  if (authResult === null) {
    if (options.requireAuth) {
      return { error: oauthAuthError('Authentication required') }
    }
    // Public mode - no auth required
    return { auth: undefined }
  }

  // Auth header provided but invalid
  if (!authResult.authenticated) {
    return { error: oauthAuthError(authResult.error || 'Authentication failed') }
  }

  // Valid authentication
  return { auth: authResult }
}
