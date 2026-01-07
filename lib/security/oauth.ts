/**
 * OAuth 2.1 Utilities for MCP Authentication
 *
 * Implements:
 * - PKCE (RFC 7636) with S256 method only
 * - Client registration helpers
 * - Token generation for OAuth clients
 */

import { db } from '@/lib/db'
import { oauthClients, oauthCodes } from '@/lib/db/schema'
import { eq, lt } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('oauth')

// ============================================
// PKCE Utilities (RFC 7636)
// ============================================

/**
 * Verify PKCE code_verifier against stored code_challenge
 * Only S256 method is supported (SHA-256 hash of verifier)
 */
export async function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string = 'S256'
): Promise<boolean> {
  if (method !== 'S256') {
    log.warn('PKCE verification failed: unsupported method', { method })
    return false
  }

  // RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier))
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Base64URL encode (no padding)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return base64url === codeChallenge
}

/**
 * Generate a cryptographically secure random string
 * Used for client_id, client_secret, authorization codes
 */
export function generateSecureRandom(length: number = 32): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Hash a secret using SHA-256
 */
export async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(secret)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ============================================
// Client Management
// ============================================

export interface RegisterClientOptions {
  clientName: string
  redirectUris: string[]
}

export interface RegisterClientResult {
  clientId: string
  clientSecret: string
  clientName: string
  redirectUris: string[]
}

/**
 * Register a new OAuth client (Dynamic Client Registration - RFC 7591)
 */
export async function registerClient(
  options: RegisterClientOptions
): Promise<RegisterClientResult> {
  const clientId = generateSecureRandom(16) // 32 hex chars
  const clientSecret = generateSecureRandom(32) // 64 hex chars
  const secretHash = await hashSecret(clientSecret)

  await db.insert(oauthClients).values({
    id: clientId,
    secretHash,
    name: options.clientName,
    redirectUris: options.redirectUris,
  })

  log.info('OAuth client registered', {
    clientId,
    clientName: options.clientName,
    redirectUris: options.redirectUris,
  })

  return {
    clientId,
    clientSecret,
    clientName: options.clientName,
    redirectUris: options.redirectUris,
  }
}

/**
 * Get client by ID
 */
export async function getClient(clientId: string) {
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId))
  return client
}

/**
 * Verify client secret
 */
export async function verifyClientSecret(
  clientId: string,
  clientSecret: string
): Promise<boolean> {
  const client = await getClient(clientId)
  if (!client || !client.secretHash) return false

  const secretHash = await hashSecret(clientSecret)
  return client.secretHash === secretHash
}

/**
 * Validate redirect URI against registered URIs
 */
export async function validateRedirectUri(
  clientId: string,
  redirectUri: string
): Promise<boolean> {
  const client = await getClient(clientId)
  if (!client) return false

  // Exact match required (no wildcards for security)
  return client.redirectUris.includes(redirectUri)
}

// ============================================
// Authorization Code Management
// ============================================

export interface CreateAuthCodeOptions {
  clientId: string
  userId: string
  codeChallenge: string
  codeChallengeMethod?: string
  redirectUri: string
  scope?: string
}

/**
 * Create an authorization code
 * Code expires in 10 minutes (RFC 6749 recommends max 10 minutes)
 */
export async function createAuthCode(options: CreateAuthCodeOptions): Promise<string> {
  const code = generateSecureRandom(32) // 64 hex chars
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  await db.insert(oauthCodes).values({
    code,
    clientId: options.clientId,
    userId: options.userId,
    codeChallenge: options.codeChallenge,
    codeChallengeMethod: options.codeChallengeMethod || 'S256',
    redirectUri: options.redirectUri,
    scope: options.scope,
    expiresAt,
  })

  log.info('Authorization code created', {
    clientId: options.clientId,
    userId: options.userId,
    expiresAt: expiresAt.toISOString(),
  })

  return code
}

/**
 * Get and validate an authorization code
 */
export async function getAuthCode(code: string) {
  const [authCode] = await db
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.code, code))

  if (!authCode) return null

  // Check expiration
  if (authCode.expiresAt < new Date()) {
    log.warn('Authorization code expired', { code: code.substring(0, 8) + '...' })
    // Delete expired code
    await db.delete(oauthCodes).where(eq(oauthCodes.code, code))
    return null
  }

  return authCode
}

/**
 * Consume (delete) an authorization code after use
 * Authorization codes are single-use
 */
export async function consumeAuthCode(code: string): Promise<void> {
  await db.delete(oauthCodes).where(eq(oauthCodes.code, code))
  log.debug('Authorization code consumed', { code: code.substring(0, 8) + '...' })
}

/**
 * Clean up expired authorization codes
 * Should be called periodically
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const result = await db
    .delete(oauthCodes)
    .where(lt(oauthCodes.expiresAt, new Date()))
    .returning({ code: oauthCodes.code })

  if (result.length > 0) {
    log.info('Cleaned up expired authorization codes', { count: result.length })
  }

  return result.length
}
