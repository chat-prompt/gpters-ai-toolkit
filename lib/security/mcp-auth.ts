/**
 * MCP API Token Authentication System
 *
 * Provides secure token generation, validation, and rate limiting for MCP API access.
 * Tokens are stored as SHA-256 hashes in the database for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mcpTokens } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('mcp-auth')

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
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean
  tokenId?: string
  name?: string
  error?: string
  rateLimit?: number
}

/**
 * In-memory rate limit tracking for tokens
 * Key: tokenId, Value: { count, resetAt }
 */
interface TokenRateLimitEntry {
  count: number
  resetAt: number
}

const tokenRateLimitStore = new Map<string, TokenRateLimitEntry>()

// Cleanup interval for rate limit store
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

function cleanupTokenRateLimits() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return

  lastCleanup = now
  for (const [key, entry] of tokenRateLimitStore.entries()) {
    if (entry.resetAt < now) {
      tokenRateLimitStore.delete(key)
    }
  }
}

/**
 * Check rate limit for a specific token
 * Returns null if within limit, error response if exceeded
 */
export function checkTokenRateLimit(
  tokenId: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupTokenRateLimits()

  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window

  let entry = tokenRateLimitStore.get(tokenId)

  // Create new entry if doesn't exist or window has expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    }
    tokenRateLimitStore.set(tokenId, entry)
    return { allowed: true, remaining: limit - 1, resetAt: entry.resetAt }
  }

  // Increment count
  entry.count++

  // Check if over limit
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Validate a token against the database
 * Also updates last_used_at and usage_count
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  // Check format first
  if (!isValidTokenFormat(token)) {
    return { valid: false, error: 'Invalid token format' }
  }

  try {
    // Hash the token
    const tokenHash = await hashToken(token)

    // Look up in database
    const [tokenRecord] = await db
      .select({
        id: mcpTokens.id,
        name: mcpTokens.name,
        isActive: mcpTokens.isActive,
        expiresAt: mcpTokens.expiresAt,
        rateLimit: mcpTokens.rateLimit,
      })
      .from(mcpTokens)
      .where(eq(mcpTokens.tokenHash, tokenHash))

    if (!tokenRecord) {
      log.warn('Token validation failed: token not found')
      return { valid: false, error: 'Invalid token' }
    }

    // Check if active
    if (!tokenRecord.isActive) {
      log.warn('Token validation failed: token is inactive', { tokenId: tokenRecord.id })
      return { valid: false, error: 'Token has been revoked' }
    }

    // Check expiration
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      log.warn('Token validation failed: token expired', { tokenId: tokenRecord.id })
      return { valid: false, error: 'Token has expired' }
    }

    // Check rate limit
    const rateLimit = tokenRecord.rateLimit || 100
    const rateLimitResult = checkTokenRateLimit(tokenRecord.id, rateLimit)

    if (!rateLimitResult.allowed) {
      log.warn('Token rate limit exceeded', {
        tokenId: tokenRecord.id,
        resetAt: new Date(rateLimitResult.resetAt).toISOString(),
      })
      return {
        valid: false,
        tokenId: tokenRecord.id,
        error: 'Rate limit exceeded',
        rateLimit,
      }
    }

    // Update usage statistics (non-blocking)
    db.update(mcpTokens)
      .set({
        lastUsedAt: new Date(),
        usageCount: sql`${mcpTokens.usageCount} + 1`,
      })
      .where(eq(mcpTokens.id, tokenRecord.id))
      .catch((err) => {
        log.error('Failed to update token usage', err)
      })

    log.debug('Token validated successfully', {
      tokenId: tokenRecord.id,
      name: tokenRecord.name,
    })

    return {
      valid: true,
      tokenId: tokenRecord.id,
      name: tokenRecord.name,
      rateLimit,
    }
  } catch (error) {
    log.error('Token validation error', error)
    return { valid: false, error: 'Token validation failed' }
  }
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null
  }

  return parts[1]
}

/**
 * MCP authentication result
 */
export interface McpAuthResult {
  authenticated: boolean
  tokenId?: string
  tokenName?: string
  error?: string
}

/**
 * Authenticate MCP API request
 * Returns auth result or null if no auth header (public mode)
 */
export async function authenticateMcpRequest(
  request: NextRequest
): Promise<McpAuthResult | null> {
  const token = extractBearerToken(request)

  // No auth header = public mode (return null to let caller decide)
  if (!token) {
    return null
  }

  const result = await validateToken(token)

  if (!result.valid) {
    return {
      authenticated: false,
      error: result.error,
    }
  }

  return {
    authenticated: true,
    tokenId: result.tokenId,
    tokenName: result.name,
  }
}

/**
 * Create MCP authentication error response
 */
export function mcpAuthError(message: string, status: 401 | 403 = 401): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
    },
    { status }
  )
}

/**
 * Middleware helper for MCP authentication
 * Supports both authenticated and public modes based on configuration
 */
export async function withMcpAuth(
  request: NextRequest,
  options: { requireAuth?: boolean } = {}
): Promise<{ error?: NextResponse; auth?: McpAuthResult }> {
  const authResult = await authenticateMcpRequest(request)

  // No auth header provided
  if (authResult === null) {
    if (options.requireAuth) {
      return { error: mcpAuthError('Authentication required') }
    }
    // Public mode - no auth required
    return { auth: undefined }
  }

  // Auth header provided but invalid
  if (!authResult.authenticated) {
    return { error: mcpAuthError(authResult.error || 'Authentication failed') }
  }

  // Valid authentication
  return { auth: authResult }
}

// ============================================
// Token Management Functions
// ============================================

export interface CreateTokenOptions {
  name: string
  description?: string
  createdBy?: string
  expiresAt?: Date
  rateLimit?: number
}

export interface CreateTokenResult {
  token: string // Raw token (only returned once)
  id: string
  name: string
  description?: string
  expiresAt?: Date
  rateLimit: number
  createdAt: Date
}

/**
 * Create a new MCP API token
 * Returns the raw token ONLY ONCE - it cannot be retrieved later
 */
export async function createToken(options: CreateTokenOptions): Promise<CreateTokenResult> {
  const rawToken = generateToken()
  const tokenHash = await hashToken(rawToken)

  const [record] = await db
    .insert(mcpTokens)
    .values({
      tokenHash,
      name: options.name,
      description: options.description,
      createdBy: options.createdBy,
      expiresAt: options.expiresAt,
      rateLimit: options.rateLimit || 100,
    })
    .returning()

  log.info('MCP token created', {
    tokenId: record.id,
    name: options.name,
    createdBy: options.createdBy,
  })

  return {
    token: rawToken,
    id: record.id,
    name: record.name,
    description: record.description ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    rateLimit: record.rateLimit ?? 100,
    createdAt: record.createdAt ?? new Date(),
  }
}

/**
 * List all tokens (without the actual token values)
 */
export async function listTokens() {
  return db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      description: mcpTokens.description,
      createdBy: mcpTokens.createdBy,
      expiresAt: mcpTokens.expiresAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      usageCount: mcpTokens.usageCount,
      rateLimit: mcpTokens.rateLimit,
      isActive: mcpTokens.isActive,
      createdAt: mcpTokens.createdAt,
      updatedAt: mcpTokens.updatedAt,
    })
    .from(mcpTokens)
    .orderBy(mcpTokens.createdAt)
}

/**
 * Get a single token by ID
 */
export async function getToken(id: string) {
  const [token] = await db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      description: mcpTokens.description,
      createdBy: mcpTokens.createdBy,
      expiresAt: mcpTokens.expiresAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      usageCount: mcpTokens.usageCount,
      rateLimit: mcpTokens.rateLimit,
      isActive: mcpTokens.isActive,
      createdAt: mcpTokens.createdAt,
      updatedAt: mcpTokens.updatedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.id, id))

  return token
}

/**
 * Revoke (deactivate) a token
 */
export async function revokeToken(id: string): Promise<boolean> {
  const result = await db
    .update(mcpTokens)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(mcpTokens.id, id))
    .returning({ id: mcpTokens.id })

  if (result.length > 0) {
    log.info('MCP token revoked', { tokenId: id })
    return true
  }

  return false
}

/**
 * Delete a token permanently
 */
export async function deleteToken(id: string): Promise<boolean> {
  const result = await db
    .delete(mcpTokens)
    .where(eq(mcpTokens.id, id))
    .returning({ id: mcpTokens.id })

  if (result.length > 0) {
    log.info('MCP token deleted', { tokenId: id })
    return true
  }

  return false
}

/**
 * Reactivate a revoked token
 */
export async function reactivateToken(id: string): Promise<boolean> {
  const result = await db
    .update(mcpTokens)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.isActive, false)))
    .returning({ id: mcpTokens.id })

  if (result.length > 0) {
    log.info('MCP token reactivated', { tokenId: id })
    return true
  }

  return false
}

/**
 * Update token settings
 */
export async function updateToken(
  id: string,
  updates: {
    name?: string
    description?: string
    expiresAt?: Date | null
    rateLimit?: number
  }
): Promise<boolean> {
  const result = await db
    .update(mcpTokens)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(mcpTokens.id, id))
    .returning({ id: mcpTokens.id })

  if (result.length > 0) {
    log.info('MCP token updated', { tokenId: id, updates })
    return true
  }

  return false
}
