/**
 * Authenticated rate limit tests
 *
 * Verifies userId-based rate limiting for authenticated users
 * and admin-tier differentiation.
 */

import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import {
  checkRateLimit,
  RateLimitPresets,
} from '@/lib/utils/rate-limit'

describe('Authenticated Rate Limit', () => {
  describe('RateLimitPresets', () => {
    it('should have authenticated preset at 300/min', () => {
      expect(RateLimitPresets.authenticated).toEqual({
        limit: 300,
        windowSec: 60,
      })
    })

    it('should have authenticatedAdmin preset at 600/min', () => {
      expect(RateLimitPresets.authenticatedAdmin).toEqual({
        limit: 600,
        windowSec: 60,
      })
    })

    it('should have standard preset at 100/min (unauthenticated)', () => {
      expect(RateLimitPresets.standard).toEqual({
        limit: 100,
        windowSec: 60,
      })
    })
  })

  describe('userId-based rate limiting', () => {
    it('should apply userId-based identifier for authenticated users', () => {
      const req = new NextRequest('https://test.example.com/api/mcp', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4' },
      })

      const userId = 'user-test-123'

      // Use authenticated preset with userId identifier
      const result = checkRateLimit(req, {
        ...RateLimitPresets.authenticated,
        identifier: () => `user:${userId}`,
      })

      expect(result.success).toBe(true)
      expect(result.limit).toBe(300)
      expect(result.remaining).toBe(299)
    })

    it('should have separate limits per user', () => {
      const req = new NextRequest('https://test.example.com/api/mcp-user-test', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4' },
      })

      // User A
      const resultA = checkRateLimit(req, {
        ...RateLimitPresets.authenticated,
        identifier: () => 'user:user-a',
      })

      // User B (same IP, different user)
      const resultB = checkRateLimit(req, {
        ...RateLimitPresets.authenticated,
        identifier: () => 'user:user-b',
      })

      // Both should have full quota
      expect(resultA.remaining).toBe(299)
      expect(resultB.remaining).toBe(299)
    })

    it('should apply admin tier with higher limit', () => {
      const req = new NextRequest('https://test.example.com/api/mcp-admin-test', {
        method: 'POST',
      })

      const result = checkRateLimit(req, {
        ...RateLimitPresets.authenticatedAdmin,
        identifier: () => 'user:admin-user',
      })

      expect(result.success).toBe(true)
      expect(result.limit).toBe(600)
      expect(result.remaining).toBe(599)
    })
  })
})
