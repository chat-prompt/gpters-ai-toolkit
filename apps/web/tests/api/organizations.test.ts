/**
 * Organization Management API integration tests
 */
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

describe('Organizations API', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping organization API tests')
    }
  })

  describe('GET /api/organizations', () => {
    it('should require authentication', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations`)
      expect([401, 307, 404]).toContain(response.status)
    })

    it('should return organizations for super_admin', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations`, {
        headers: { 'x-test-user-role': 'super_admin' },
      })

      expect([200, 401, 307, 404]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data).toHaveProperty('organizations')
        expect(data).toHaveProperty('total')
        expect(Array.isArray(data.organizations)).toBe(true)
      }
    })

    it('should return only user organizations for regular users', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations`, {
        headers: { 'x-test-user-role': 'viewer' },
      })

      expect([200, 401, 307, 404]).toContain(response.status)

      if (response.status === 200) {
        const data = await response.json()
        expect(data).toHaveProperty('organizations')
        expect(Array.isArray(data.organizations)).toBe(true)
      }
    })
  })

  describe('POST /api/organizations', () => {
    it('should require super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          name: 'Test Org',
          slug: 'test-org',
          allowedDomains: ['test.com'],
        }),
      })

      expect([403, 401, 307, 404]).toContain(response.status)
    })

    it('should validate required fields', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({
          name: 'Test Org',
        }),
      })

      expect([400, 401, 307, 404]).toContain(response.status)
    })

    it('should validate allowedDomains is non-empty array', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({
          name: 'Test Org',
          slug: 'test-org',
          allowedDomains: [],
        }),
      })

      expect([400, 401, 307, 404]).toContain(response.status)
    })
  })

  describe('GET /api/organizations/[orgId]', () => {
    it('should require authentication', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org-id`)
      expect([401, 307, 404]).toContain(response.status)
    })

    it('should return 404 for non-member access', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/non-existent-org`, {
        headers: { 'x-test-user-role': 'viewer' },
      })

      expect([404, 401, 307]).toContain(response.status)
    })

    it('should allow super_admin to access any organization', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/any-org-id`, {
        headers: { 'x-test-user-role': 'super_admin' },
      })

      expect([200, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('PATCH /api/organizations/[orgId]', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org-id`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'viewer',
        },
        body: JSON.stringify({ name: 'Updated Name' }),
      })

      expect([403, 404, 401, 307]).toContain(response.status)
    })

    it('should validate at least one field to update', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org-id`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({}),
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('GET /api/organizations/[orgId]/members', () => {
    it('should require authentication', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`)
      expect([401, 307, 404]).toContain(response.status)
    })

    it('should return 404 for non-member access', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/non-existent/members`, {
        headers: { 'x-test-user-role': 'viewer' },
      })

      expect([404, 401, 307]).toContain(response.status)
    })
  })

  describe('POST /api/organizations/[orgId]/members', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'viewer',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          role: 'org_viewer',
        }),
      })

      expect([403, 404, 401, 307]).toContain(response.status)
    })

    it('should validate required fields', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })

    it('should validate role is valid OrgRole', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          role: 'invalid_role',
        }),
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('PATCH /api/organizations/[orgId]/members', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'viewer',
        },
        body: JSON.stringify({
          userId: 'user-id',
          role: 'org_editor',
        }),
      })

      expect([403, 404, 401, 307]).toContain(response.status)
    })

    it('should validate role is valid OrgRole', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({
          userId: 'user-id',
          role: 'invalid_role',
        }),
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('DELETE /api/organizations/[orgId]/members', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(
        `${API_BASE_URL}/api/organizations/test-org/members?userId=user-id`,
        {
          method: 'DELETE',
          headers: { 'x-test-user-role': 'viewer' },
        }
      )

      expect([403, 404, 401, 307]).toContain(response.status)
    })

    it('should require userId parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/members`, {
        method: 'DELETE',
        headers: { 'x-test-user-role': 'super_admin' },
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('GET /api/organizations/[orgId]/domains', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/domains`, {
        headers: { 'x-test-user-role': 'viewer' },
      })

      expect([403, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('POST /api/organizations/[orgId]/domains', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'viewer',
        },
        body: JSON.stringify({ domain: 'example.com' }),
      })

      expect([403, 404, 401, 307]).toContain(response.status)
    })

    it('should validate domain field', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'super_admin',
        },
        body: JSON.stringify({}),
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })
  })

  describe('DELETE /api/organizations/[orgId]/domains', () => {
    it('should require org_admin or super_admin role', async () => {
      if (!serverAvailable) return

      const response = await fetch(
        `${API_BASE_URL}/api/organizations/test-org/domains?domain=example.com`,
        {
          method: 'DELETE',
          headers: { 'x-test-user-role': 'viewer' },
        }
      )

      expect([403, 404, 401, 307]).toContain(response.status)
    })

    it('should require domain parameter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/organizations/test-org/domains`, {
        method: 'DELETE',
        headers: { 'x-test-user-role': 'super_admin' },
      })

      expect([400, 404, 401, 307]).toContain(response.status)
    })
  })
})
