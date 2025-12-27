import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password'

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/auth/signin`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

describe('Catalog CRUD API', () => {
  let serverAvailable = false
  let testItemId: string | null = null

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping catalog CRUD tests')
    }
  })

  afterAll(async () => {
    // Cleanup: delete test item if it exists
    if (serverAvailable && testItemId) {
      try {
        await fetch(`${API_BASE_URL}/api/catalog/${testItemId}`, {
          method: 'DELETE',
          headers: {
            'x-admin-password': ADMIN_PASSWORD,
          },
        })
      } catch (error) {
        console.log('Failed to cleanup test item:', error)
      }
    }
  })

  describe('POST /api/catalog', () => {
    it('should create a new catalog item with valid admin password', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `test-skill-${Date.now()}`,
        type: 'skill',
        name: 'Test Skill',
        description: 'A test skill for API testing',
        author: 'test-author',
        tags: ['testing', 'api'],
        teamTag: 'general',
        difficulty: 'easy',
        content: '# Test Skill Content\n\nThis is a test skill.',
        marketplaceEnabled: false,
        marketplaceVersion: '1.0.0',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.id).toBe(newItem.id)
      expect(data.name).toBe(newItem.name)
      expect(data.type).toBe(newItem.type)
      expect(data.author).toBe(newItem.author)
      expect(data.description).toBe(newItem.description)

      // Store test item ID for cleanup
      testItemId = newItem.id
    })

    it('should fail to create item without admin password', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `test-skill-unauthorized-${Date.now()}`,
        type: 'skill',
        name: 'Unauthorized Test',
        content: 'Test content',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })

    it('should fail to create item with wrong admin password', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `test-skill-wrong-password-${Date.now()}`,
        type: 'skill',
        name: 'Wrong Password Test',
        content: 'Test content',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': 'wrong-password',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })

    it('should fail to create item without required fields', async () => {
      if (!serverAvailable) return

      const invalidItem = {
        description: 'Missing required fields',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(invalidItem),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should create agent with type-specific fields', async () => {
      if (!serverAvailable) return

      const agentItem = {
        id: `test-agent-${Date.now()}`,
        type: 'agent',
        name: 'Test Agent',
        description: 'A test agent',
        author: 'test-author',
        content: '# Test Agent Content',
        agentModel: 'sonnet',
        agentPermissionMode: 'default',
        agentSkills: 'skill1,skill2',
        allowedTools: 'Read,Write,Bash',
        marketplaceEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(agentItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.agentModel).toBe('sonnet')
      expect(data.agentPermissionMode).toBe('default')
      expect(data.agentSkills).toBe('skill1,skill2')
      expect(data.allowedTools).toBe('Read,Write,Bash')

      // Cleanup
      await fetch(`${API_BASE_URL}/api/catalog/${agentItem.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      })
    })

    it('should create command with command-specific fields', async () => {
      if (!serverAvailable) return

      const commandItem = {
        id: `test-command-${Date.now()}`,
        type: 'command',
        name: 'Test Command',
        description: 'A test command',
        author: 'test-author',
        content: '# Test Command Content',
        commandArgumentHint: '[message]',
        commandDisableModelInvocation: true,
        allowedTools: 'Bash',
        marketplaceEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(commandItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.commandArgumentHint).toBe('[message]')
      expect(data.commandDisableModelInvocation).toBe(true)
      expect(data.allowedTools).toBe('Bash')

      // Cleanup
      await fetch(`${API_BASE_URL}/api/catalog/${commandItem.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      })
    })
  })

  describe('GET /api/catalog/[id]', () => {
    let createdItemId: string

    beforeAll(async () => {
      if (!serverAvailable) return

      // Create a test item for GET tests
      const newItem = {
        id: `test-get-skill-${Date.now()}`,
        type: 'skill',
        name: 'Test GET Skill',
        description: 'Test item for GET operation',
        author: 'test-author',
        content: '# Test Content',
        marketplaceEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(newItem),
      })

      if (response.status === 201) {
        createdItemId = newItem.id
      }
    })

    afterAll(async () => {
      if (serverAvailable && createdItemId) {
        await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': ADMIN_PASSWORD },
        })
      }
    })

    it('should get a catalog item by ID', async () => {
      if (!serverAvailable || !createdItemId) return

      const response = await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe(createdItemId)
      expect(data.name).toBe('Test GET Skill')
      expect(data.type).toBe('skill')
    })

    it('should return 404 for non-existent item', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/catalog/non-existent-id`)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Catalog item not found')
    })
  })

  describe('PUT /api/catalog/[id]', () => {
    let createdItemId: string

    beforeAll(async () => {
      if (!serverAvailable) return

      // Create a test item for PUT tests
      const newItem = {
        id: `test-put-skill-${Date.now()}`,
        type: 'skill',
        name: 'Test PUT Skill',
        description: 'Original description',
        author: 'test-author',
        content: '# Original Content',
        tags: ['original'],
        marketplaceEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(newItem),
      })

      if (response.status === 201) {
        createdItemId = newItem.id
      }
    })

    afterAll(async () => {
      if (serverAvailable && createdItemId) {
        await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': ADMIN_PASSWORD },
        })
      }
    })

    it('should update a catalog item with valid admin password', async () => {
      if (!serverAvailable || !createdItemId) return

      const updates = {
        name: 'Updated Test Skill',
        description: 'Updated description',
        tags: ['updated', 'testing'],
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(updates),
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe(createdItemId)
      expect(data.name).toBe('Updated Test Skill')
      expect(data.description).toBe('Updated description')
      expect(data.tags).toEqual(['updated', 'testing'])
    })

    it('should fail to update item without admin password', async () => {
      if (!serverAvailable || !createdItemId) return

      const updates = {
        name: 'Unauthorized Update',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })

    it('should fail to update item with wrong admin password', async () => {
      if (!serverAvailable || !createdItemId) return

      const updates = {
        name: 'Wrong Password Update',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': 'wrong-password',
        },
        body: JSON.stringify(updates),
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })

    it('should return 404 when updating non-existent item', async () => {
      if (!serverAvailable) return

      const updates = {
        name: 'Update Non-Existent',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog/non-existent-id`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(updates),
      })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Catalog item not found')
    })

    it('should update partial fields only', async () => {
      if (!serverAvailable || !createdItemId) return

      // Update only name, leave other fields unchanged
      const updates = {
        name: 'Partially Updated Skill',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog/${createdItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(updates),
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.name).toBe('Partially Updated Skill')
      // Other fields should remain unchanged
      expect(data.author).toBe('test-author')
    })
  })

  describe('DELETE /api/catalog/[id]', () => {
    it('should delete a catalog item with valid admin password', async () => {
      if (!serverAvailable) return

      // Create an item to delete
      const newItem = {
        id: `test-delete-skill-${Date.now()}`,
        type: 'skill',
        name: 'Test DELETE Skill',
        content: '# Test Content',
        marketplaceEnabled: false,
      }

      const createResponse = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(newItem),
      })

      expect(createResponse.status).toBe(201)

      // Delete the item
      const deleteResponse = await fetch(`${API_BASE_URL}/api/catalog/${newItem.id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': ADMIN_PASSWORD,
        },
      })

      expect(deleteResponse.status).toBe(200)
      const data = await deleteResponse.json()
      expect(data.success).toBe(true)

      // Verify item is deleted
      const getResponse = await fetch(`${API_BASE_URL}/api/catalog/${newItem.id}`)
      expect(getResponse.status).toBe(404)
    })

    it('should fail to delete item without admin password', async () => {
      if (!serverAvailable) return

      // Create an item first
      const newItem = {
        id: `test-delete-unauthorized-${Date.now()}`,
        type: 'skill',
        name: 'Test Unauthorized DELETE',
        content: '# Test Content',
        marketplaceEnabled: false,
      }

      await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(newItem),
      })

      // Try to delete without password
      const response = await fetch(`${API_BASE_URL}/api/catalog/${newItem.id}`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')

      // Cleanup
      await fetch(`${API_BASE_URL}/api/catalog/${newItem.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      })
    })

    it('should return 404 when deleting non-existent item', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/catalog/non-existent-id`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': ADMIN_PASSWORD,
        },
      })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Catalog item not found')
    })
  })

  describe('GET /api/catalog with filters', () => {
    let skillItemId: string
    let agentItemId: string
    let authorItemId: string

    beforeAll(async () => {
      if (!serverAvailable) return

      // Create test items with different types and authors
      const skillItem = {
        id: `test-filter-skill-${Date.now()}`,
        type: 'skill',
        name: 'Test Filter Skill',
        author: 'test-author',
        content: '# Test Skill',
        marketplaceEnabled: false,
      }

      const agentItem = {
        id: `test-filter-agent-${Date.now()}`,
        type: 'agent',
        name: 'Test Filter Agent',
        author: 'test-author',
        content: '# Test Agent',
        marketplaceEnabled: false,
      }

      const authorItem = {
        id: `test-filter-author-${Date.now()}`,
        type: 'skill',
        name: 'Test Author Filter Skill',
        author: 'primadonna',
        content: '# Test Author',
        marketplaceEnabled: false,
      }

      const responses = await Promise.all([
        fetch(`${API_BASE_URL}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': ADMIN_PASSWORD,
          },
          body: JSON.stringify(skillItem),
        }),
        fetch(`${API_BASE_URL}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': ADMIN_PASSWORD,
          },
          body: JSON.stringify(agentItem),
        }),
        fetch(`${API_BASE_URL}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': ADMIN_PASSWORD,
          },
          body: JSON.stringify(authorItem),
        }),
      ])

      if (responses[0].status === 201) skillItemId = skillItem.id
      if (responses[1].status === 201) agentItemId = agentItem.id
      if (responses[2].status === 201) authorItemId = authorItem.id
    })

    afterAll(async () => {
      if (!serverAvailable) return

      // Cleanup test items
      await Promise.all([
        skillItemId && fetch(`${API_BASE_URL}/api/catalog/${skillItemId}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': ADMIN_PASSWORD },
        }),
        agentItemId && fetch(`${API_BASE_URL}/api/catalog/${agentItemId}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': ADMIN_PASSWORD },
        }),
        authorItemId && fetch(`${API_BASE_URL}/api/catalog/${authorItemId}`, {
          method: 'DELETE',
          headers: { 'x-admin-password': ADMIN_PASSWORD },
        }),
      ])
    })

    it('should filter catalog items by type=skill', async () => {
      if (!serverAvailable || !skillItemId) return

      const response = await fetch(`${API_BASE_URL}/api/catalog?type=skill`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)

      // All returned items should be of type 'skill'
      const allSkills = data.every((item: { type: string }) => item.type === 'skill')
      expect(allSkills).toBe(true)

      // Our test skill should be in the results
      const hasTestSkill = data.some((item: { id: string }) => item.id === skillItemId)
      expect(hasTestSkill).toBe(true)
    })

    it('should filter catalog items by type=agent', async () => {
      if (!serverAvailable || !agentItemId) return

      const response = await fetch(`${API_BASE_URL}/api/catalog?type=agent`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)

      // All returned items should be of type 'agent'
      const allAgents = data.every((item: { type: string }) => item.type === 'agent')
      expect(allAgents).toBe(true)

      // Our test agent should be in the results
      const hasTestAgent = data.some((item: { id: string }) => item.id === agentItemId)
      expect(hasTestAgent).toBe(true)
    })

    it('should return all items without filter', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/catalog`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })

    it('should handle unknown type filter gracefully', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/catalog?type=unknown-type`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      // Should return empty array for unknown type
      expect(data.length).toBe(0)
    })
  })
})
