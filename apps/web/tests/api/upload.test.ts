// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/auth/signin`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

// Note: /api/marketplace endpoint was removed and replaced with /api/mcp
// See tests/api/mcp.test.ts for MCP server tests

describe('Upload API', () => {
  let serverAvailable = false
  const testItemIds: string[] = []

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping upload API tests')
    }
  })

  afterAll(async () => {
    // Cleanup: delete all test items
    if (serverAvailable) {
      for (const id of testItemIds) {
        try {
          await fetch(`${API_BASE_URL}/api/catalog/${id}`, {
            method: 'DELETE',
            headers: {
              'x-test-user-role': 'admin',
            },
          })
        } catch (error) {
          console.log('Failed to cleanup test item:', id, error)
        }
      }
    }
  })

  describe('POST /api/upload', () => {
    it('should upload a new skill without authentication', async () => {
      if (!serverAvailable) return

      const testId = `upload-test-skill-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'skill',
        name: 'Upload Test Skill',
        description: 'A skill uploaded via public API',
        author: 'test-uploader',
        tags: ['testing', 'upload'],
        content: '# Upload Test Skill\n\nThis is a test skill.',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.item).toBeDefined()
      expect(data.item.id).toBe(testId)
      expect(data.item.name).toBe(newItem.name)
      expect(data.item.type).toBe('skill')
    })

    it('should upload an agent with agent-specific fields', async () => {
      if (!serverAvailable) return

      const testId = `upload-test-agent-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'agent',
        name: 'Upload Test Agent',
        description: 'An agent uploaded via public API',
        author: 'test-uploader',
        content: '# Upload Test Agent\n\nThis is a test agent.',
        agentModel: 'sonnet',
        agentPermissionMode: 'default',
        agentSkills: 'skill1,skill2',
        allowedTools: 'Read,Write',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.item.agentModel).toBe('sonnet')
      expect(data.item.agentPermissionMode).toBe('default')
      expect(data.item.agentSkills).toBe('skill1,skill2')
    })

    it('should upload a command with command-specific fields', async () => {
      if (!serverAvailable) return

      const testId = `upload-test-command-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'command',
        name: 'Upload Test Command',
        description: 'A command uploaded via public API',
        author: 'test-uploader',
        content: '# Upload Test Command\n\nThis is a test command.',
        commandArgumentHint: '[message]',
        commandDisableModelInvocation: true,
        allowedTools: 'Bash',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.item.commandArgumentHint).toBe('[message]')
      expect(data.item.commandDisableModelInvocation).toBe(true)
    })

    it('should upload a guide', async () => {
      if (!serverAvailable) return

      const testId = `upload-test-guide-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'guide',
        name: 'Upload Test Guide',
        description: 'A guide uploaded via public API',
        author: 'test-uploader',
        content: '# Upload Test Guide\n\nThis is a test guide.',
        difficulty: 'easy',
        estimatedTime: '5 minutes',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.item.type).toBe('guide')
      expect(data.item.difficulty).toBe('easy')
    })

    it('should fail without required field: id', async () => {
      if (!serverAvailable) return

      const newItem = {
        type: 'skill',
        name: 'Missing ID Skill',
        content: 'Test content',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should fail without required field: type', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `missing-type-${Date.now()}`,
        name: 'Missing Type Skill',
        content: 'Test content',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should fail without required field: name', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `missing-name-${Date.now()}`,
        type: 'skill',
        content: 'Test content',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should fail without required field: content', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `missing-content-${Date.now()}`,
        type: 'skill',
        name: 'Missing Content Skill',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('should fail with invalid type', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: `invalid-type-${Date.now()}`,
        type: 'invalid-type',
        name: 'Invalid Type Item',
        content: 'Test content',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Invalid type')
    })

    it('should fail with duplicate ID', async () => {
      if (!serverAvailable) return

      const testId = `upload-duplicate-${Date.now()}`
      testItemIds.push(testId)

      const firstItem = {
        id: testId,
        type: 'skill',
        name: 'First Item',
        content: 'First content',
      }

      // First upload should succeed
      const firstResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(firstItem),
      })

      expect(firstResponse.status).toBe(201)

      // Second upload with same ID should fail
      const secondItem = {
        id: testId,
        type: 'skill',
        name: 'Duplicate Item',
        content: 'Duplicate content',
      }

      const secondResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(secondItem),
      })

      expect(secondResponse.status).toBe(409)

      const data = await secondResponse.json()
      expect(data.error).toContain('already exists')
    })

    it('should use null authorId when not provided', async () => {
      if (!serverAvailable) return

      const testId = `upload-no-author-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'skill',
        name: 'No Author Skill',
        content: 'Test content',
        // authorId is not provided
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.item.authorId).toBeNull()
    })

    it('should use default teamTag when not provided', async () => {
      if (!serverAvailable) return

      const testId = `upload-no-teamtag-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'skill',
        name: 'No TeamTag Skill',
        content: 'Test content',
        // teamTag is not provided
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.item.teamTag).toBe('general')
    })

    it('should handle optional fields correctly', async () => {
      if (!serverAvailable) return

      const testId = `upload-all-fields-${Date.now()}`
      testItemIds.push(testId)

      const newItem = {
        id: testId,
        type: 'skill',
        name: 'Full Fields Skill',
        description: 'A complete skill with all fields',
        // Note: authorId is a FK to users table, not a string
        tags: ['tag1', 'tag2', 'tag3'],
        teamTag: 'platform',
        difficulty: 'medium',
        pluginId: 'test-plugin',
        estimatedTime: '10 minutes',
        dependencies: ['dep1', 'dep2'],
        content: '# Full Fields Skill\n\nThis is complete.',
        readme: '# README\n\nThis is the readme.',
      }

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.item.description).toBe(newItem.description)
      expect(data.item.tags).toEqual(newItem.tags)
      expect(data.item.teamTag).toBe(newItem.teamTag)
      expect(data.item.difficulty).toBe(newItem.difficulty)
      expect(data.item.pluginId).toBe(newItem.pluginId)
      expect(data.item.estimatedTime).toBe(newItem.estimatedTime)
      expect(data.item.dependencies).toEqual(newItem.dependencies)
      expect(data.item.readme).toBe(newItem.readme)
    })
  })
})
