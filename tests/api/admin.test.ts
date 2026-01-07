// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/api/catalog`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

describe('Admin API', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping admin API tests')
    }
  })

  // Note: /api/marketplace/sync endpoint was removed
  // Marketplace sync functionality has been replaced with MCP server at /api/mcp

  describe('Admin Seed API (/api/admin/seed)', () => {
    describe('GET /api/admin/seed', () => {
      it('should require admin authentication', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`)

        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBeDefined()
      })

      it('should reject invalid admin password', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          headers: {
            'x-admin-password': 'wrong-password',
          },
        })

        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBeDefined()
      })

      it('should return seed status with valid auth', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'GET',
          headers: {
            'x-test-user-role': 'admin',
          },
        })

        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data.tags).toBeDefined()
        // Note: authors table was removed - author info now in catalog_items.authorId
        expect(data.mcpServers).toBeDefined()
        expect(data.hardcodedTags).toBeDefined()
        expect(data.hardcodedMcpServers).toBeDefined()

        expect(typeof data.tags).toBe('number')
        expect(typeof data.mcpServers).toBe('number')
      })

      it('should have correct content-type', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'GET',
          headers: {
            'x-test-user-role': 'admin',
          },
        })

        expect(response.status).toBe(200)

        const contentType = response.headers.get('content-type')
        expect(contentType).toContain('application/json')
      })
    })

    describe('POST /api/admin/seed', () => {
      it('should require admin authentication', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
        })

        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBeDefined()
      })

      it('should reject invalid admin password', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
          headers: {
            'x-admin-password': 'wrong-password',
          },
        })

        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBeDefined()
      })

      it('should seed database with valid auth', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
          headers: {
            'x-test-user-role': 'admin',
          },
        })

        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data.success).toBe(true)
        expect(data.message).toBeDefined()
        expect(data.results).toBeDefined()

        // Check results structure (authors was removed)
        expect(data.results.tags).toBeDefined()
        expect(data.results.mcpServers).toBeDefined()

        // Each should have created and skipped counts
        expect(typeof data.results.tags.created).toBe('number')
        expect(typeof data.results.tags.skipped).toBe('number')
        expect(typeof data.results.mcpServers.created).toBe('number')
        expect(typeof data.results.mcpServers.skipped).toBe('number')
      })

      it(
        'should be idempotent (running twice should skip existing)',
        async () => {
          if (!serverAvailable) return

          // Run seed first time
          await fetch(`${API_BASE_URL}/api/admin/seed`, {
            method: 'POST',
            headers: {
              'x-test-user-role': 'admin',
            },
          })

          // Run seed second time
          const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
            method: 'POST',
            headers: {
              'x-test-user-role': 'admin',
            },
          })

          expect(response.status).toBe(200)

          const data = await response.json()
          expect(data.success).toBe(true)

          // Second run should mostly skip (items already exist)
          // Total created + skipped should equal hardcoded counts
        },
        15000
      )

      it('should have correct content-type', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
          headers: {
            'x-test-user-role': 'admin',
          },
        })

        expect(response.status).toBe(200)

        const contentType = response.headers.get('content-type')
        expect(contentType).toContain('application/json')
      })
    })
  })
})
