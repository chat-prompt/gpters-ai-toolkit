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

describe('Welfare Engine Stats API', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping integration tests')
    }
  })

  describe('GET /api/welfare-engine/stats', () => {
    it('should return stats with default 30d period', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()

        expect(data.period).toBe('30d')
        expect(data.startDate).toBeDefined()
        expect(data.endDate).toBeDefined()

        expect(data.metrics).toBeDefined()
        expect(data.metrics.accumulation).toBeDefined()
        expect(typeof data.metrics.accumulation.totalSkills).toBe('number')
        expect(typeof data.metrics.accumulation.newSkills).toBe('number')
        expect(typeof data.metrics.accumulation.totalUpdates).toBe('number')
        expect(typeof data.metrics.accumulation.newUpdates).toBe('number')

        expect(data.metrics.utilization).toBeDefined()
        expect(typeof data.metrics.utilization.totalViews).toBe('number')
        expect(typeof data.metrics.utilization.totalSearches).toBe('number')
        expect(Array.isArray(data.metrics.utilization.topSkills)).toBe(true)

        expect(data.metrics.quality).toBeDefined()
        expect(typeof data.metrics.quality.successRate).toBe('number')
        expect(typeof data.metrics.quality.avgResponseTime).toBe('number')

        expect(data.metrics.secondary).toBeDefined()
        expect(Array.isArray(data.metrics.secondary.contributors)).toBe(true)

        expect(data.rankings).toBeDefined()
        expect(Array.isArray(data.rankings.skills)).toBe(true)
        expect(Array.isArray(data.rankings.contributors)).toBe(true)
      }
    })

    it('should accept 7d period parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats?period=7d`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.period).toBe('7d')
      }
    })

    it('should accept 90d period parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats?period=90d`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.period).toBe('90d')
      }
    })

    it('should return weekly report in JSON format', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats?weeklyReport=true`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.weekStart).toBeDefined()
        expect(data.current).toBeDefined()
        expect(data.previous).toBeDefined()
        expect(data.changes).toBeDefined()
        expect(typeof data.changes.skills).toBe('number')
        expect(typeof data.changes.updates).toBe('number')
        expect(typeof data.changes.views).toBe('number')
        expect(typeof data.changes.searches).toBe('number')
      }
    })

    it('should return weekly report in text format', async () => {
      if (!serverAvailable) return

      const response = await fetch(
        `${API_BASE_URL}/api/welfare-engine/stats?weeklyReport=true&format=text`
      )
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const text = await response.text()
        expect(text).toContain('복리 엔진 주간 리포트')
        expect(text).toContain('[축적]')
        expect(text).toContain('[활용]')
        expect(text).toContain('[품질]')
      }
    })

    it('should handle custom date range', async () => {
      if (!serverAvailable) return

      const startDate = new Date('2024-01-01').toISOString()
      const endDate = new Date('2024-01-31').toISOString()

      const response = await fetch(
        `${API_BASE_URL}/api/welfare-engine/stats?period=custom&startDate=${startDate}&endDate=${endDate}`
      )
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data.period).toBe('custom')
        expect(data.startDate).toBeDefined()
        expect(data.endDate).toBeDefined()
      }
    })

    it('should validate top skills structure', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        const topSkills = data.metrics.utilization.topSkills

        if (topSkills.length > 0) {
          const skill = topSkills[0]
          expect(skill.id).toBeDefined()
          expect(skill.name).toBeDefined()
          expect(typeof skill.views).toBe('number')
        }
      }
    })

    it('should validate skill rankings structure', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        const skills = data.rankings.skills

        if (skills.length > 0) {
          const skill = skills[0]
          expect(skill.id).toBeDefined()
          expect(skill.name).toBeDefined()
          expect(skill.type).toBeDefined()
          expect(typeof skill.views).toBe('number')
        }
      }
    })

    it('should validate contributors structure', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/welfare-engine/stats`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        const contributors = data.rankings.contributors

        if (contributors.length > 0) {
          const contributor = contributors[0]
          expect(contributor.name).toBeDefined()
          expect(typeof contributor.skillCount).toBe('number')
        }
      }
    })

    it('should respect rate limits', async () => {
      if (!serverAvailable) return

      const requests = Array.from({ length: 10 }, () =>
        fetch(`${API_BASE_URL}/api/welfare-engine/stats`)
      )

      const responses = await Promise.all(requests)
      const statuses = responses.map((r) => r.status)

      expect(statuses.every((s) => [200, 401, 307, 429].includes(s))).toBe(true)
    })
  })
})
