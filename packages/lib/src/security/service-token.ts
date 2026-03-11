/**
 * Service-to-service token authentication
 *
 * Simple Bearer token validation for server-to-server REST API calls.
 * Used by external services (e.g., Rona) to authenticate against
 * the welfare engine's REST endpoints.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '../core/logger'
import { ApiErrors } from '../utils/api-utils'

const log = createLogger('service-token')

/** Result of service token validation */
export interface ServiceAuthResult {
  /** Whether the token is valid */
  authenticated: boolean
  /** Service name from X-Service-Name header */
  serviceName: string
  /** Error response if authentication failed */
  error?: NextResponse
}

/**
 * Validate service token from Authorization header
 *
 * Checks the Bearer token against RONA_SERVICE_TOKEN env var.
 * Also extracts the service name from X-Service-Name header.
 *
 * @param request - Incoming HTTP request
 * @returns Authentication result with service name or error response
 */
export function validateServiceToken(request: NextRequest): ServiceAuthResult {
  const expectedToken = process.env.RONA_SERVICE_TOKEN
  const serviceName = request.headers.get('x-service-name') || 'unknown'

  if (!expectedToken) {
    log.error('RONA_SERVICE_TOKEN not configured')
    return {
      authenticated: false,
      serviceName,
      error: ApiErrors.internalError('Service authentication not configured'),
    }
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return {
      authenticated: false,
      serviceName,
      error: ApiErrors.unauthorized('Missing Authorization header'),
    }
  }

  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token || token === authHeader) {
    return {
      authenticated: false,
      serviceName,
      error: ApiErrors.unauthorized('Invalid Authorization format. Use: Bearer <token>'),
    }
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, expectedToken)) {
    log.warn('Invalid service token attempt', { serviceName })
    return {
      authenticated: false,
      serviceName,
      error: ApiErrors.unauthorized('Invalid service token'),
    }
  }

  return { authenticated: true, serviceName }
}

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * Pads shorter string to prevent length leakage via early return.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length)
  let result = a.length ^ b.length // non-zero if lengths differ
  for (let i = 0; i < maxLen; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return result === 0
}
