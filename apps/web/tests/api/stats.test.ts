// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/auth/signin`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

describe('Stats API', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping integration tests')
    }
  })

  describe('GET /api/stats', () => {
    it('should return stats with default 30d period', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()

        // Check period
        expect(data.period).toBe('30d')

        // Check summary structure
        expect(data.summary).toBeDefined()
        expect(typeof data.summary.totalItems).toBe('number')

        // Check typeDistribution structure
        expect(data.typeDistribution).toBeDefined()
        expect(typeof data.typeDistribution.skill).toBe('number')
        expect(typeof data.typeDistribution.agent).toBe('number')
        expect(typeof data.typeDistribution.command).toBe('number')
        expect(typeof data.typeDistribution.guide).toBe('number')

        // Check categoryDistribution structure
        expect(Array.isArray(data.categoryDistribution)).toBe(true)

        // Check recentActivity structure
        expect(data.recentActivity).toBeDefined()
        expect(Array.isArray(data.recentActivity.newItems)).toBe(true)
      }
    })

    it('should accept 7d period parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats?period=7d`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.period).toBe('7d')
      }
    })

    it('should accept 90d period parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats?period=90d`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.period).toBe('90d')
      }
    })

    it('should return valid category distribution format', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()

        // If there are categories, validate their structure
        if (data.categoryDistribution.length > 0) {
          const category = data.categoryDistribution[0]
          expect(category.id).toBeDefined()
          expect(category.label).toBeDefined()
          expect(typeof category.count).toBe('number')
        }

        // Should be limited to 10 categories
        expect(data.categoryDistribution.length).toBeLessThanOrEqual(10)
      }
    })

    it('should return valid recent activity format', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()

        // Validate new items structure
        if (data.recentActivity.newItems.length > 0) {
          const item = data.recentActivity.newItems[0]
          expect(item.id).toBeDefined()
          expect(item.name).toBeDefined()
          expect(item.type).toBeDefined()
          expect(item.authorName).toBeDefined()
          expect(item.createdAt).toBeDefined()
        }

        // Should be limited to 10 items
        expect(data.recentActivity.newItems.length).toBeLessThanOrEqual(10)
      }
    })
  })
})
