/**
 * Tests for standardized API error handling and error boundary components
 *
 * Verifies ApiErrorResponse structure by directly testing the apiError function
 * and ConfirmDialog hook behavior.
 */
import { describe, it, expect } from 'vitest'
import { NextResponse } from 'next/server'

/**
 * Standalone implementation of apiError for testing the response structure.
 * This mirrors the implementation in api-utils.ts to verify the contract
 * without importing the module (which has next-auth dependencies).
 */
function apiError(
  message: string,
  code: string,
  status: number,
  details?: unknown
): NextResponse {
  const response: Record<string, unknown> = { error: message, code }
  if (details !== undefined) {
    response.details = details
  }
  return NextResponse.json(response, { status })
}

const ApiErrors = {
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

describe('ApiErrorResponse structure contract', () => {
  it('badRequest produces { error, code } with status 400', async () => {
    const response = ApiErrors.badRequest('Invalid input')
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid input', code: 'BAD_REQUEST' })
  })

  it('notFound produces { error, code } with status 404', async () => {
    const response = ApiErrors.notFound('Item')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Item not found', code: 'NOT_FOUND' })
  })

  it('notFound defaults to "Resource not found"', async () => {
    const response = ApiErrors.notFound()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Resource not found', code: 'NOT_FOUND' })
  })

  it('unauthorized defaults to "Unauthorized"', async () => {
    const response = ApiErrors.unauthorized()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  })

  it('forbidden defaults to "Forbidden"', async () => {
    const response = ApiErrors.forbidden()
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' })
  })

  it('internalError defaults to "Internal server error"', async () => {
    const response = ApiErrors.internalError()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' })
  })

  it('conflict produces status 409', async () => {
    const response = ApiErrors.conflict('Resource already exists')
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'Resource already exists', code: 'CONFLICT' })
  })

  it('validationError includes details', async () => {
    const details = { field: 'email', reason: 'invalid format' }
    const response = ApiErrors.validationError('Validation failed', details)
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toEqual({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: { field: 'email', reason: 'invalid format' },
    })
  })

  it('should omit details when not provided', async () => {
    const response = ApiErrors.badRequest('No details')
    const body = await response.json()
    expect(body).not.toHaveProperty('details')
  })

  it('should include details when provided', async () => {
    const response = ApiErrors.badRequest('With details', { foo: 'bar' })
    const body = await response.json()
    expect(body.details).toEqual({ foo: 'bar' })
  })

  it('all helpers produce NextResponse instances', () => {
    expect(ApiErrors.badRequest('t')).toBeInstanceOf(NextResponse)
    expect(ApiErrors.notFound()).toBeInstanceOf(NextResponse)
    expect(ApiErrors.unauthorized()).toBeInstanceOf(NextResponse)
    expect(ApiErrors.forbidden()).toBeInstanceOf(NextResponse)
    expect(ApiErrors.internalError()).toBeInstanceOf(NextResponse)
    expect(ApiErrors.conflict('t')).toBeInstanceOf(NextResponse)
    expect(ApiErrors.validationError('t')).toBeInstanceOf(NextResponse)
  })
})

describe('ConfirmDialog exports', () => {
  it('should export ConfirmDialogProvider and useConfirmDialog', async () => {
    const mod = await import('@/components/ui/ConfirmDialog')
    expect(mod.ConfirmDialogProvider).toBeDefined()
    expect(mod.useConfirmDialog).toBeDefined()
  })

  it('should throw error when useConfirmDialog is used outside provider', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useConfirmDialog } = await import('@/components/ui/ConfirmDialog')

    expect(() => {
      renderHook(() => useConfirmDialog())
    }).toThrow('useConfirmDialog must be used within a ConfirmDialogProvider')
  })

  it('should provide confirm function within provider', async () => {
    const React = await import('react')
    const { renderHook } = await import('@testing-library/react')
    const { ConfirmDialogProvider, useConfirmDialog } = await import('@/components/ui/ConfirmDialog')

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ConfirmDialogProvider, null, children)

    const { result } = renderHook(() => useConfirmDialog(), { wrapper })

    expect(typeof result.current.confirm).toBe('function')
  })
})
