/**
 * OAuth Access Token Management
 *
 * Provides secure token generation, validation for OAuth-issued access tokens.
 * Tokens are stored as SHA-256 hashes in the database for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, oauthAccessTokens, oauthClients, oauthRefreshTokens, users } from '@gpters/db'
import { eq, and, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { getBaseUrl } from '../utils'
import { isGptersEmail } from '../account-access'

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
  clientName?: string
  scope?: string
  userRole?: string
  error?: string
}

export interface OAuthAuthResult {
  authenticated: boolean
  accessTokenId?: string
  userId?: string
  clientId?: string
  clientName?: string
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
  const [tokenOwner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, options.userId))

  if (!isGptersEmail(tokenOwner?.email)) {
    log.warn('Access token issuance denied: account is not authorized', {
      userId: options.userId,
      clientId: options.clientId,
    })
    throw new Error('Account is not authorized')
  }

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

    // Look up in database with user role and client name (left joins to handle missing records)
    const [tokenRecord] = await db
      .select({
        id: oauthAccessTokens.id,
        clientId: oauthAccessTokens.clientId,
        userId: oauthAccessTokens.userId,
        scope: oauthAccessTokens.scope,
        isActive: oauthAccessTokens.isActive,
        expiresAt: oauthAccessTokens.expiresAt,
        userEmail: users.email,
        userRole: users.role,
        clientName: oauthClients.name,
      })
      .from(oauthAccessTokens)
      .leftJoin(users, eq(oauthAccessTokens.userId, users.id))
      .leftJoin(oauthClients, eq(oauthAccessTokens.clientId, oauthClients.id))
      .where(eq(oauthAccessTokens.tokenHash, tokenHash))

    if (!tokenRecord) {
      log.warn('Access token validation failed: token not found')
      return { valid: false, error: 'Invalid token' }
    }

    if (!isGptersEmail(tokenRecord.userEmail)) {
      log.warn('Access token validation failed: account is not authorized', {
        accessTokenId: tokenRecord.id,
      })
      return { valid: false, error: 'Account is not authorized' }
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
      clientName: tokenRecord.clientName ?? undefined,
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
    clientName: result.clientName,
    scope: result.scope,
    userRole: result.userRole,
  }
}

/**
 * Create OAuth authentication error response
 * For 401 responses, includes WWW-Authenticate header for OAuth discovery
 */
export function oauthAuthError(message: string, status: 401 | 403 = 401): NextResponse {
  const BASE_URL = getBaseUrl()

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

// ============================================
// Refresh Token Constants & Types
// ============================================

const REFRESH_TOKEN_PREFIX = 'mrt_'
const REFRESH_TOKEN_LENGTH = 32 // hex characters after prefix

/** Refresh token validity period (30 days) */
export const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60

/** Access token validity period (1 hour) */
export const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60

/**
 * Options for creating a refresh token
 */
export interface CreateRefreshTokenOptions {
  clientId: string
  userId: string
  accessTokenId: string
  scope?: string
  /** Token chain identifier. Auto-generated if not provided */
  familyId?: string
  /** Rotation counter within the family */
  generation?: number
}

/**
 * Result of creating a refresh token
 */
export interface CreateRefreshTokenResult {
  token: string // Raw token (only returned once)
  id: string
  familyId: string
}

/**
 * Result of validating a refresh token
 */
export interface RefreshTokenValidationResult {
  valid: boolean
  id?: string
  clientId?: string
  userId?: string
  accessTokenId?: string
  scope?: string
  familyId?: string
  generation?: number
  error?: string
}

// ============================================
// Refresh Token Functions
// ============================================

/**
 * Generate a cryptographically secure refresh token
 * Format: mrt_[32 hex characters]
 */
export function generateRefreshToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(REFRESH_TOKEN_LENGTH / 2))
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${REFRESH_TOKEN_PREFIX}${hexString}`
}

/**
 * Validate refresh token format
 */
export function isValidRefreshTokenFormat(token: string): boolean {
  if (!token.startsWith(REFRESH_TOKEN_PREFIX)) return false
  const hexPart = token.slice(REFRESH_TOKEN_PREFIX.length)
  if (hexPart.length !== REFRESH_TOKEN_LENGTH) return false
  return /^[0-9a-f]+$/i.test(hexPart)
}

/**
 * Create a new refresh token and store its hash in the database
 */
export async function createRefreshToken(
  options: CreateRefreshTokenOptions
): Promise<CreateRefreshTokenResult> {
  const rawToken = generateRefreshToken()
  const tokenHash = await hashToken(rawToken)
  const familyId = options.familyId ?? crypto.randomUUID()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000)

  const [record] = await db
    .insert(oauthRefreshTokens)
    .values({
      tokenHash,
      clientId: options.clientId,
      userId: options.userId,
      accessTokenId: options.accessTokenId,
      scope: options.scope,
      familyId,
      generation: options.generation ?? 0,
      expiresAt,
    })
    .returning({ id: oauthRefreshTokens.id })

  log.info('Refresh token created', {
    refreshTokenId: record.id,
    clientId: options.clientId,
    userId: options.userId,
    familyId,
    generation: options.generation ?? 0,
  })

  return {
    token: rawToken,
    id: record.id,
    familyId,
  }
}

/**
 * Validate a refresh token against the database
 *
 * Checks format, hash match, expiration, and active status.
 * If a used (inactive) token is presented, this is a replay attack —
 * the entire token family is revoked.
 */
export async function validateRefreshToken(
  token: string
): Promise<RefreshTokenValidationResult> {
  if (!isValidRefreshTokenFormat(token)) {
    return { valid: false, error: 'Invalid refresh token format' }
  }

  try {
    const tokenHash = await hashToken(token)

    const [record] = await db
      .select()
      .from(oauthRefreshTokens)
      .where(eq(oauthRefreshTokens.tokenHash, tokenHash))

    if (!record) {
      return { valid: false, error: 'Invalid refresh token' }
    }

    // Replay detection: if a previously rotated token is reused,
    // revoke the entire family to prevent token theft
    if (!record.isActive) {
      log.warn('Refresh token replay detected — revoking family', {
        refreshTokenId: record.id,
        familyId: record.familyId,
        revokeReason: record.revokeReason,
      })
      await revokeTokenFamily(record.familyId, 'replay_detected')
      return { valid: false, error: 'Token reuse detected — family revoked' }
    }

    // Check expiration
    if (record.expiresAt < new Date()) {
      log.warn('Refresh token expired', { refreshTokenId: record.id })
      return { valid: false, error: 'Refresh token expired' }
    }

    return {
      valid: true,
      id: record.id,
      clientId: record.clientId,
      userId: record.userId,
      accessTokenId: record.accessTokenId ?? undefined,
      scope: record.scope ?? undefined,
      familyId: record.familyId,
      generation: record.generation,
    }
  } catch (error) {
    log.error('Refresh token validation error', error)
    return { valid: false, error: 'Refresh token validation failed' }
  }
}

/**
 * Revoke all refresh tokens in a family
 *
 * Used when replay attack is detected or user logs out.
 */
export async function revokeTokenFamily(
  familyId: string,
  reason: string
): Promise<void> {
  await db
    .update(oauthRefreshTokens)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokeReason: reason,
    })
    .where(
      and(
        eq(oauthRefreshTokens.familyId, familyId),
        eq(oauthRefreshTokens.isActive, true),
      )
    )

  log.info('Token family revoked', { familyId, reason })
}

/**
 * Revoke a specific access token (deactivate it)
 *
 * Used during refresh token rotation to invalidate the old access token.
 */
export async function revokeAccessToken(accessTokenId: string): Promise<void> {
  await db
    .update(oauthAccessTokens)
    .set({ isActive: false })
    .where(eq(oauthAccessTokens.id, accessTokenId))

  log.info('Access token revoked', { accessTokenId })
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
