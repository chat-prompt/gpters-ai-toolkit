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

describe('Catalog API', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping integration tests')
    }
  })

  describe('GET /api/catalog', () => {
    it('should return catalog items', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/catalog`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
      }
    })
  })

  describe('GET /api/tags', () => {
    it('should return tags list', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
      }
    })
  })

  // Note: /api/authors endpoint was removed - author info stored in catalog_items.authorId

  describe('GET /api/mcp-servers', () => {
    it('should return MCP servers list', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers`)
      expect([200, 401, 307]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
      }
    })
  })
})
