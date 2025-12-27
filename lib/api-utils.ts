/**
 * Standardized API utilities for consistent error handling and responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from './logger'
import { auth } from '@/lib/auth'
import { hasPermission, type Permission, type UserRole } from '@/lib/rbac'

const log = createLogger('api')

// Standard error codes
export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = keyof typeof ErrorCodes

// Error response interface
interface ApiErrorResponse {
  error: string
  code: ErrorCode
  details?: unknown
}

// Success response interface
interface ApiSuccessResponse<T> {
  data: T
  message?: string
}

/**
 * Create a standardized error response
 */
export function apiError(
  message: string,
  code: ErrorCode,
  status: number,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    error: message,
    code,
  }
  if (details !== undefined) {
    response.details = details
  }
  return NextResponse.json(response, { status })
}

/**
 * Common error response helpers
 */
export const ApiErrors = {
  badRequest: (message: string, details?: unknown) =>
    apiError(message, 'BAD_REQUEST', 400, details),

  unauthorized: (message = 'Unauthorized') =>
    apiError(message, 'UNAUTHORIZED', 401),

  forbidden: (message = 'Forbidden') =>
    apiError(message, 'FORBIDDEN', 403),

  notFound: (resource = 'Resource') =>
    apiError(`${resource} not found`, 'NOT_FOUND', 404),

  conflict: (message: string) =>
    apiError(message, 'CONFLICT', 409),

  validationError: (message: string, details?: unknown) =>
    apiError(message, 'VALIDATION_ERROR', 422, details),

  internalError: (message = 'Internal server error') =>
    apiError(message, 'INTERNAL_ERROR', 500),
}

/**
 * Create a standardized success response
 */
export function apiSuccess<T>(
  data: T,
  status = 200,
  message?: string
): NextResponse<ApiSuccessResponse<T> | T> {
  // For simple responses, just return the data directly
  if (!message) {
    return NextResponse.json(data, { status })
  }
  return NextResponse.json({ data, message }, { status })
}

/**
 * Check admin authentication (legacy - uses password header)
 * @deprecated Use requirePermission from rbac.ts instead
 */
export function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === process.env.ADMIN_PASSWORD
}

/**
 * Require admin authentication - returns error response if not authenticated
 * @deprecated Use requirePermission from rbac.ts instead
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  if (!checkAdminAuth(request)) {
    return ApiErrors.unauthorized('Admin authentication required')
  }
  return null
}

/**
 * Require specific permission using RBAC
 * Returns error response if user doesn't have permission, null otherwise
 * Also supports x-admin-password header as fallback for API/testing access
 */
export async function requirePermissionAsync(
  permission: Permission,
  request?: NextRequest
): Promise<NextResponse | null> {
  // First, check for x-admin-password header (admin fallback for API/testing)
  if (request) {
    const password = request.headers.get('x-admin-password')
    if (password === process.env.ADMIN_PASSWORD) {
      // Admin password grants admin role, which has all permissions
      return null
    }
  }

  // Check session-based auth
  const session = await auth()

  if (!session?.user) {
    return ApiErrors.unauthorized('Authentication required')
  }

  const userRole = session.user.role as UserRole | undefined

  if (!hasPermission(userRole, permission)) {
    return ApiErrors.forbidden(`Permission denied: ${permission}`)
  }

  return null
}

/**
 * Get current user from session
 */
export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

/**
 * Wrapper for API handlers with standardized error handling
 */
export function withErrorHandler<T>(
  handler: (request: NextRequest, context?: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: T): Promise<NextResponse> => {
    try {
      return await handler(request, context)
    } catch (error) {
      log.error('API request failed', error, {
        method: request.method,
        url: request.url,
      })

      // Handle specific error types
      if (error instanceof SyntaxError) {
        return ApiErrors.badRequest('Invalid JSON in request body')
      }

      // Generic error
      const message = error instanceof Error ? error.message : 'Unknown error'
      return ApiErrors.internalError(
        process.env.NODE_ENV === 'development' ? message : 'Internal server error'
      )
    }
  }
}

/**
 * Parse and validate JSON body with error handling
 */
export async function parseJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * Validate required fields in request body
 */
export function validateRequired<T extends Record<string, unknown>>(
  body: T,
  fields: (keyof T)[]
): { valid: true } | { valid: false; missing: string[] } {
  const missing = fields.filter(field => {
    const value = body[field]
    return value === undefined || value === null || value === ''
  })

  if (missing.length > 0) {
    return { valid: false, missing: missing.map(String) }
  }
  return { valid: true }
}
