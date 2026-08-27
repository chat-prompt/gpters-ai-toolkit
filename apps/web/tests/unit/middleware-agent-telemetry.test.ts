import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/middleware', () => ({
  default: () => vi.fn(),
}))

vi.mock('../../lib/core/auth-config', () => ({
  auth: (handler: unknown) => handler,
}))

const { isPublicRoute } = await import('../../middleware')

describe('agent telemetry middleware boundary', () => {
  it('Bearer 수집 경로만 세션 인증에서 제외한다', () => {
    expect(isPublicRoute('/api/ax/agent-telemetry')).toBe(true)
    expect(isPublicRoute('/en/api/ax/agent-telemetry')).toBe(true)
    expect(isPublicRoute('/api/ax/agent-telemetry/enroll')).toBe(true)

    expect(isPublicRoute('/api/ax')).toBe(false)
    expect(isPublicRoute('/api/ax/overview')).toBe(false)
    expect(isPublicRoute('/api/ax/agent-telemetry/extra')).toBe(false)
  })
})
