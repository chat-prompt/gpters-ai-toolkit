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

describe('Tags API', () => {
  let serverAvailable = false
  const testTagId = `test-tag-${Date.now()}`

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping integration tests')
    }
  })

  describe('GET /api/tags', () => {
    it('should return tags list', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('POST /api/tags', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: testTagId,
          label: 'Test Tag',
        }),
      })
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Admin authentication required')
    })

    it('should create tag with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: testTagId,
          label: 'Test Tag',
          color: 'bg-blue-100 text-blue-800',
          description: 'A test tag',
        }),
      })
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.id).toBe(testTagId)
      expect(data.label).toBe('Test Tag')
      expect(data.color).toBe('bg-blue-100 text-blue-800')
    })

    it('should reject missing required fields', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          label: 'Missing ID',
        }),
      })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should reject duplicate tag ID', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: testTagId,
          label: 'Duplicate Tag',
        }),
      })
      expect(response.status).toBe(409)

      const data = await response.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /api/tags/[id]', () => {
    it('should return single tag', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/${testTagId}`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe(testTagId)
      expect(data.label).toBe('Test Tag')
    })

    it('should return 404 for non-existent tag', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/non-existent-tag`)
      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toContain('not found')
    })
  })

  describe('PUT /api/tags/[id]', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/${testTagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Updated Tag',
        }),
      })
      expect(response.status).toBe(401)
    })

    it('should update tag with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/${testTagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          label: 'Updated Test Tag',
          description: 'Updated description',
        }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.label).toBe('Updated Test Tag')
      expect(data.description).toBe('Updated description')
    })

    it('should return 404 for non-existent tag', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/non-existent-tag`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          label: 'Updated Tag',
        }),
      })
      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /api/tags/[id]', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/${testTagId}`, {
        method: 'DELETE',
      })
      expect(response.status).toBe(401)
    })

    it('should delete tag with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/${testTagId}`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
        },
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should return 404 for non-existent tag', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/tags/non-existent-tag`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
        },
      })
      expect(response.status).toBe(404)
    })
  })
})

describe('Authors API', () => {
  let serverAvailable = false
  const testAuthorId = `test-author-${Date.now()}`

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping integration tests')
    }
  })

  describe('GET /api/authors', () => {
    it('should return authors list', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('POST /api/authors', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: testAuthorId,
          name: 'Test Author',
        }),
      })
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Admin authentication required')
    })

    it('should create author with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: testAuthorId,
          name: 'Test Author',
          email: 'test@example.com',
          bio: 'A test author bio',
        }),
      })
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.id).toBe(testAuthorId)
      expect(data.name).toBe('Test Author')
      expect(data.email).toBe('test@example.com')
    })

    it('should reject missing required fields', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: 'missing-name',
        }),
      })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should reject duplicate author ID', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: testAuthorId,
          name: 'Duplicate Author',
        }),
      })
      expect(response.status).toBe(409)

      const data = await response.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /api/authors/[id]', () => {
    it('should return single author', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/${testAuthorId}`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe(testAuthorId)
      expect(data.name).toBe('Test Author')
    })

    it('should return 404 for non-existent author', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/non-existent-author`)
      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toContain('not found')
    })
  })

  describe('PUT /api/authors/[id]', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/${testAuthorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Author',
        }),
      })
      expect(response.status).toBe(401)
    })

    it('should update author with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/${testAuthorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          name: 'Updated Test Author',
          bio: 'Updated bio',
        }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.name).toBe('Updated Test Author')
      expect(data.bio).toBe('Updated bio')
    })

    it('should return 404 for non-existent author', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/non-existent-author`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          name: 'Updated Author',
        }),
      })
      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /api/authors/[id]', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/${testAuthorId}`, {
        method: 'DELETE',
      })
      expect(response.status).toBe(401)
    })

    it('should delete author with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/${testAuthorId}`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
        },
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should return 404 for non-existent author', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/authors/non-existent-author`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
        },
      })
      expect(response.status).toBe(404)
    })
  })
})

describe('MCP Servers API', () => {
  let serverAvailable = false
  const testServerId = `test-server-${Date.now()}`

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping integration tests')
    }
  })

  describe('GET /api/mcp-servers', () => {
    it('should return MCP servers list', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('POST /api/mcp-servers', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: testServerId,
          label: 'Test Server',
        }),
      })
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Admin authentication required')
    })

    it('should create MCP server with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: testServerId,
          label: 'Test Server',
          description: 'A test MCP server',
          documentationUrl: 'https://example.com/docs',
        }),
      })
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.id).toBe(testServerId)
      expect(data.label).toBe('Test Server')
      expect(data.description).toBe('A test MCP server')
    })

    it('should reject missing required fields', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          label: 'Missing ID',
        }),
      })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should reject duplicate MCP server ID', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          id: testServerId,
          label: 'Duplicate Server',
        }),
      })
      expect(response.status).toBe(409)

      const data = await response.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /api/mcp-servers/[id]', () => {
    it('should return single MCP server', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/${testServerId}`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe(testServerId)
      expect(data.label).toBe('Test Server')
    })

    it('should return 404 for non-existent MCP server', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/non-existent-server`)
      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toContain('not found')
    })
  })

  describe('PUT /api/mcp-servers/[id]', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/${testServerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Updated Server',
        }),
      })
      expect(response.status).toBe(401)
    })

    it('should update MCP server with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/${testServerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          label: 'Updated Test Server',
          description: 'Updated description',
        }),
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.label).toBe('Updated Test Server')
      expect(data.description).toBe('Updated description')
    })

    it('should return 404 for non-existent MCP server', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/non-existent-server`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify({
          label: 'Updated Server',
        }),
      })
      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /api/mcp-servers/[id]', () => {
    it('should reject without admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/${testServerId}`, {
        method: 'DELETE',
      })
      expect(response.status).toBe(401)
    })

    it('should delete MCP server with admin auth', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/${testServerId}`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
        },
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should return 404 for non-existent MCP server', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp-servers/non-existent-server`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
        },
      })
      expect(response.status).toBe(404)
    })
  })
})
