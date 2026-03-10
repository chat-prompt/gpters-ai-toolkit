/**
 * Service Token Authentication Tests
 *
 * Unit tests for server-to-server service token validation (DEV-3055)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock next/server's NextResponse used in api-utils
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    NextRequest: actual.NextRequest,
    NextResponse: actual.NextResponse,
  }
})

// Mock auth used in api-utils
vi.mock('../../../../packages/lib/src/core/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

const { validateServiceToken } = await import('../../../../packages/lib/src/security/service-token')
const { NextRequest } = await import('next/server')

function createRequest(headers: Record<string, string> = {}): InstanceType<typeof NextRequest> {
  return new NextRequest('http://localhost:3000/api/skills/search', {
    method: 'POST',
    headers,
  })
}

describe('Service Token Authentication', () => {
  const VALID_TOKEN = 'test-rona-service-token-abc123'

  beforeEach(() => {
    vi.stubEnv('RONA_SERVICE_TOKEN', VALID_TOKEN)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should authenticate with valid Bearer token', () => {
    const req = createRequest({
      Authorization: `Bearer ${VALID_TOKEN}`,
      'X-Service-Name': 'rona',
    })

    const result = validateServiceToken(req)

    expect(result.authenticated).toBe(true)
    expect(result.serviceName).toBe('rona')
    expect(result.error).toBeUndefined()
  })

  it('should reject missing Authorization header', () => {
    const req = createRequest({
      'X-Service-Name': 'rona',
    })

    const result = validateServiceToken(req)

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should reject invalid token', () => {
    const req = createRequest({
      Authorization: 'Bearer wrong-token',
      'X-Service-Name': 'rona',
    })

    const result = validateServiceToken(req)

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should reject non-Bearer authorization', () => {
    const req = createRequest({
      Authorization: `Basic ${VALID_TOKEN}`,
    })

    const result = validateServiceToken(req)

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should default service name to "unknown"', () => {
    const req = createRequest({
      Authorization: `Bearer ${VALID_TOKEN}`,
    })

    const result = validateServiceToken(req)

    expect(result.authenticated).toBe(true)
    expect(result.serviceName).toBe('unknown')
  })

  it('should return error when RONA_SERVICE_TOKEN is not configured', () => {
    vi.stubEnv('RONA_SERVICE_TOKEN', '')

    const req = createRequest({
      Authorization: `Bearer ${VALID_TOKEN}`,
      'X-Service-Name': 'rona',
    })

    const result = validateServiceToken(req)

    expect(result.authenticated).toBe(false)
    expect(result.error).toBeDefined()
  })
})
