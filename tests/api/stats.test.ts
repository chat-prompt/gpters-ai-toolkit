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
        expect(typeof data.summary.totalInstallations).toBe('number')
        expect(typeof data.summary.avgInstallationsPerDay).toBe('number')
        expect(data.summary.topMethod).toBeDefined()

        // Check trends structure
        expect(data.trends).toBeDefined()
        expect(Array.isArray(data.trends.daily)).toBe(true)
        expect(Array.isArray(data.trends.weekly)).toBe(true)
        expect(Array.isArray(data.trends.monthly)).toBe(true)

        // Check topItems structure
        expect(Array.isArray(data.topItems)).toBe(true)

        // Check typeDistribution structure
        expect(data.typeDistribution).toBeDefined()
        expect(typeof data.typeDistribution.skill).toBe('number')
        expect(typeof data.typeDistribution.agent).toBe('number')
        expect(typeof data.typeDistribution.command).toBe('number')
        expect(typeof data.typeDistribution.guide).toBe('number')

        // Check installationsByMethod structure
        expect(data.installationsByMethod).toBeDefined()
        expect(typeof data.installationsByMethod).toBe('object')

        // Check categoryDistribution structure
        expect(Array.isArray(data.categoryDistribution)).toBe(true)

        // Check recentActivity structure
        expect(data.recentActivity).toBeDefined()
        expect(Array.isArray(data.recentActivity.installations)).toBe(true)
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
        // Daily trend should have 7 entries
        expect(data.trends.daily.length).toBe(7)
      }
    })

    it('should accept 90d period parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats?period=90d`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.period).toBe('90d')
        // Daily trend should have 90 entries
        expect(data.trends.daily.length).toBe(90)
      }
    })

    it('should return proper daily trend data format', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats?period=7d`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()

        // Each daily entry should have date and count
        if (data.trends.daily.length > 0) {
          const entry = data.trends.daily[0]
          expect(entry.date).toBeDefined()
          expect(typeof entry.count).toBe('number')
          // Date should be in YYYY-MM-DD format
          expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      }
    })

    it('should return valid top items format', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()

        // If there are top items, validate their structure
        if (data.topItems.length > 0) {
          const item = data.topItems[0]
          expect(item.id).toBeDefined()
          expect(item.name).toBeDefined()
          expect(item.type).toBeDefined()
          expect(item.authorName).toBeDefined()
          expect(typeof item.installCount).toBe('number')
        }

        // Should be limited to 10 items
        expect(data.topItems.length).toBeLessThanOrEqual(10)
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

        // Validate recent installations structure
        if (data.recentActivity.installations.length > 0) {
          const install = data.recentActivity.installations[0]
          expect(install.id).toBeDefined()
          expect(install.itemId).toBeDefined()
          expect(install.itemName).toBeDefined()
          expect(install.itemType).toBeDefined()
          expect(install.method).toBeDefined()
          expect(install.createdAt).toBeDefined()
        }

        // Validate new items structure
        if (data.recentActivity.newItems.length > 0) {
          const item = data.recentActivity.newItems[0]
          expect(item.id).toBeDefined()
          expect(item.name).toBeDefined()
          expect(item.type).toBeDefined()
          expect(item.authorName).toBeDefined()
          expect(item.createdAt).toBeDefined()
        }

        // Should be limited to 10 items each
        expect(data.recentActivity.installations.length).toBeLessThanOrEqual(10)
        expect(data.recentActivity.newItems.length).toBeLessThanOrEqual(10)
      }
    })
  })
})
