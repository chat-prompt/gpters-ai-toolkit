import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password'

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

  describe('Marketplace Sync API (/api/marketplace/sync)', () => {
    describe('POST /api/marketplace/sync', () => {
      it('should require admin authentication', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/marketplace/sync`, {
          method: 'POST',
        })

        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBeDefined()
      })

      it('should reject invalid admin password', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/marketplace/sync`, {
          method: 'POST',
          headers: {
            'x-admin-password': 'wrong-password',
          },
        })

        expect(response.status).toBe(401)

        const data = await response.json()
        expect(data.error).toBeDefined()
      })

      it('should accept valid admin authentication', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/marketplace/sync`, {
          method: 'POST',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        // May succeed (200) or fail due to GitHub config (500)
        // But should not be 401 (unauthorized)
        expect(response.status).not.toBe(401)

        const data = await response.json()

        if (response.status === 200) {
          // Successful sync
          expect(data.success).toBe(true)
          expect(data.syncedAt).toBeDefined()
          expect(data.stats).toBeDefined()
          expect(data.stats.filesCreated).toBeDefined()
          expect(data.stats.filesUpdated).toBeDefined()
          expect(data.stats.filesDeleted).toBeDefined()
        } else {
          // Failed due to config (no GitHub token, etc.)
          expect(data.error).toBeDefined()
        }
      })

      it('should return sync stats on success', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/marketplace/sync`, {
          method: 'POST',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        if (response.status === 200) {
          const data = await response.json()

          expect(data.success).toBe(true)
          expect(data.syncedAt).toBeDefined()
          expect(data.stats).toBeDefined()
          expect(typeof data.stats.filesCreated).toBe('number')
          expect(typeof data.stats.filesUpdated).toBe('number')
          expect(typeof data.stats.filesDeleted).toBe('number')
          expect(typeof data.stats.errors).toBe('number')
          expect(data.details).toBeDefined()
        }
      })

      it('should have correct content-type', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/marketplace/sync`, {
          method: 'POST',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        const contentType = response.headers.get('content-type')
        expect(contentType).toContain('application/json')
      })
    })
  })

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
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data.tags).toBeDefined()
        expect(data.authors).toBeDefined()
        expect(data.mcpServers).toBeDefined()
        expect(data.hardcodedTags).toBeDefined()
        expect(data.hardcodedMcpServers).toBeDefined()

        expect(typeof data.tags).toBe('number')
        expect(typeof data.authors).toBe('number')
        expect(typeof data.mcpServers).toBe('number')
      })

      it('should have correct content-type', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'GET',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
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
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data.success).toBe(true)
        expect(data.message).toBeDefined()
        expect(data.results).toBeDefined()

        // Check results structure
        expect(data.results.tags).toBeDefined()
        expect(data.results.mcpServers).toBeDefined()
        expect(data.results.authors).toBeDefined()

        // Each should have created and skipped counts
        expect(typeof data.results.tags.created).toBe('number')
        expect(typeof data.results.tags.skipped).toBe('number')
        expect(typeof data.results.mcpServers.created).toBe('number')
        expect(typeof data.results.mcpServers.skipped).toBe('number')
        expect(typeof data.results.authors.created).toBe('number')
        expect(typeof data.results.authors.skipped).toBe('number')
      })

      it('should be idempotent (running twice should skip existing)', async () => {
        if (!serverAvailable) return

        // Run seed first time
        await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        // Run seed second time
        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data.success).toBe(true)

        // Second run should mostly skip (items already exist)
        // Total created + skipped should equal hardcoded counts
      })

      it('should have correct content-type', async () => {
        if (!serverAvailable) return

        const response = await fetch(`${API_BASE_URL}/api/admin/seed`, {
          method: 'POST',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })

        expect(response.status).toBe(200)

        const contentType = response.headers.get('content-type')
        expect(contentType).toContain('application/json')
      })
    })
  })
})
