/**
 * Simple in-memory rate limiter for API routes
 * Uses sliding window algorithm
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from './logger'

const log = createLogger('rate-limit')

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Time window in seconds */
  windowSec: number
  /** Optional identifier function (defaults to IP) */
  identifier?: (req: NextRequest) => string
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically (every 5 minutes)
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

function cleanupOldEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return

  lastCleanup = now
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}

/**
 * Get client identifier from request
 * Uses X-Forwarded-For header for proxied requests, falls back to IP
 */
function getClientIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    // Get the first IP in the chain (original client)
    return forwarded.split(',')[0].trim()
  }

  // Fall back to connection IP or a default
  return req.headers.get('x-real-ip') || 'unknown'
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a request
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): RateLimitResult {
  cleanupOldEntries()

  const identifier = config.identifier?.(req) || getClientIdentifier(req)
  const key = `${req.nextUrl.pathname}:${identifier}`
  const now = Date.now()
  const windowMs = config.windowSec * 1000

  let entry = rateLimitStore.get(key)

  // Create new entry if doesn't exist or window has expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    }
    rateLimitStore.set(key, entry)

    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: entry.resetAt,
    }
  }

  // Increment count
  entry.count++

  // Check if over limit
  if (entry.count > config.limit) {
    log.warn('Rate limit exceeded', {
      identifier,
      path: req.nextUrl.pathname,
      count: entry.count,
      limit: config.limit
    })

    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Create a rate limit error response with proper headers
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)

  return NextResponse.json(
    {
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt.toString(),
        'Retry-After': retryAfter.toString(),
      },
    }
  )
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', result.limit.toString())
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', result.resetAt.toString())
  return response
}

/**
 * Middleware helper for rate limiting
 * Returns error response if rate limited, null otherwise
 */
export function withRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): NextResponse | null {
  const result = checkRateLimit(req, config)

  if (!result.success) {
    return rateLimitResponse(result)
  }

  return null
}

// Preset configurations for common use cases
export const RateLimitPresets = {
  /** Standard API: 100 requests per minute */
  standard: { limit: 100, windowSec: 60 },

  /** Auth endpoints: 10 requests per minute */
  auth: { limit: 10, windowSec: 60 },

  /** Search/expensive operations: 30 requests per minute */
  search: { limit: 30, windowSec: 60 },

  /** Admin operations: 60 requests per minute */
  admin: { limit: 60, windowSec: 60 },

  /** Installation tracking: 200 requests per minute (high volume) */
  tracking: { limit: 200, windowSec: 60 },
} as const
