// @vitest-environment node

/**
 * 카탈로그 CRUD API 통합 테스트.
 *
 * 이 스위트는 실제 서버에 항목을 **생성한다.** 격리된 일회용 DB를 보는 서버에만 돌린다
 * (`TEST_API_URL`·`TEST_DATABASE_URL`·`CONFIRM_ISOLATED_API_TESTS`). 운영·공유 DB에 돌리면
 * 만든 항목이 카탈로그에 남는다.
 */
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

/**
 * 이 스위트가 만든 항목 id 전부.
 *
 * 개별 it 안의 정리는 그 위의 expect가 하나라도 실패하면 실행되지 않는다. 2026-08-19에 그렇게
 * 30건(skill 21 · agent 6 · command 3)이 운영 카탈로그에 남았다. 그래서 정리는 개별 블록이 아니라
 * afterAll 한 곳에서 책임진다.
 */
const createdItemIds = new Set<string>()

/**
 * 만든 항목을 정리 목록에 올린다.
 *
 * 요청을 보내기 **전에** id를 등록해야 한다. 응답을 본 뒤에 등록하면 그 사이 assertion이 실패했을 때
 * 이미 만들어진 항목을 놓친다.
 *
 * @param id - 만들려는 카탈로그 항목 id
 * @returns 그대로 돌려준 id (payload에 인라인으로 쓰기 위해)
 */
function trackTestItem(id: string): string {
  createdItemIds.add(id)
  return id
}

/**
 * 항목 하나를 지우고 정말 사라졌는지 확인한다.
 *
 * DELETE 응답만 믿지 않는다 — 조직 소유 검사에 걸리면 404가 오는데, 그건 "없다"와 구분되지 않는다.
 * 그래서 GET으로 부재를 직접 확인한다.
 *
 * @param id - 지울 카탈로그 항목 id
 * @returns 카탈로그에서 사라졌으면 true
 */
async function removeTestItem(id: string): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/api/catalog/${id}`, {
      method: 'DELETE',
      headers: { 'x-test-user-role': 'admin' },
    })
    const check = await fetch(`${API_BASE_URL}/api/catalog/${id}`)
    return check.status === 404
  } catch {
    return false
  }
}

describe('Catalog CRUD API', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping catalog CRUD tests')
    }
  })

  afterAll(async () => {
    if (!serverAvailable) return

    const leaked: string[] = []
    for (const id of createdItemIds) {
      if (!(await removeTestItem(id))) leaked.push(id)
    }
    createdItemIds.clear()

    // 조용히 넘기지 않는다. 여기서 남은 항목은 운영 카탈로그에 그대로 쌓이고,
    // 지표 분모(전체 스킬 수)까지 오염시킨다.
    if (leaked.length > 0) {
      throw new Error(
        `테스트 항목 ${leaked.length}건이 카탈로그에 남았다. 직접 지워야 한다: ${leaked.join(', ')}`
      )
    }
  })

  describe('POST /api/catalog', () => {
    it('should create a new catalog item with valid admin password', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: trackTestItem(`test-skill-${Date.now()}`),
        type: 'skill',
        name: 'Test Skill',
        description: 'A test skill for API testing',
        // Note: authorId is a FK to users table, not a string field
        tags: ['testing', 'api'],
        difficulty: 'easy',
        content: '# Test Skill Content\n\nThis is a test skill.',
        mcpEnabled: false,
        version: '1.0.0',
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify(newItem),
      })

      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.id).toBe(newItem.id)
      expect(data.name).toBe(newItem.name)
      expect(data.type).toBe(newItem.type)
      expect(data.description).toBe(newItem.description)
    })

    it('should fail to create item without admin password', async () => {
      if (!serverAvailable) return

      const newItem = {
        id: trackTestItem(`test-skill-unauthorized-${Date.now()}`),
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
        id: trackTestItem(`test-skill-wrong-password-${Date.now()}`),
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
          'x-test-user-role': 'admin',
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
        id: trackTestItem(`test-agent-${Date.now()}`),
        type: 'agent',
        name: 'Test Agent',
        description: 'A test agent',
        author: 'test-author',
        content: '# Test Agent Content',
        agentModel: 'sonnet',
        agentPermissionMode: 'default',
        agentSkills: 'skill1,skill2',
        allowedTools: 'Read,Write,Bash',
        mcpEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
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
        headers: { 'x-test-user-role': 'admin' },
      })
    })

    it('should create command with command-specific fields', async () => {
      if (!serverAvailable) return

      const commandItem = {
        id: trackTestItem(`test-command-${Date.now()}`),
        type: 'command',
        name: 'Test Command',
        description: 'A test command',
        author: 'test-author',
        content: '# Test Command Content',
        commandArgumentHint: '[message]',
        commandDisableModelInvocation: true,
        allowedTools: 'Bash',
        mcpEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
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
        headers: { 'x-test-user-role': 'admin' },
      })
    })
  })

  describe('GET /api/catalog/[id]', () => {
    let createdItemId: string

    beforeAll(async () => {
      if (!serverAvailable) return

      // Create a test item for GET tests
      const newItem = {
        id: trackTestItem(`test-get-skill-${Date.now()}`),
        type: 'skill',
        name: 'Test GET Skill',
        description: 'Test item for GET operation',
        author: 'test-author',
        content: '# Test Content',
        mcpEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
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
          headers: { 'x-test-user-role': 'admin' },
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
        id: trackTestItem(`test-put-skill-${Date.now()}`),
        type: 'skill',
        name: 'Test PUT Skill',
        description: 'Original description',
        author: 'test-author',
        content: '# Original Content',
        tags: ['original'],
        mcpEnabled: false,
      }

      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
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
          headers: { 'x-test-user-role': 'admin' },
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
          'x-test-user-role': 'admin',
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
          'x-test-user-role': 'admin',
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
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify(updates),
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.name).toBe('Partially Updated Skill')
      // Other fields should remain unchanged - type should still be 'skill'
      expect(data.type).toBe('skill')
    })
  })

  describe('DELETE /api/catalog/[id]', () => {
    it('should delete a catalog item with valid admin password', async () => {
      if (!serverAvailable) return

      // Create an item to delete
      const newItem = {
        id: trackTestItem(`test-delete-skill-${Date.now()}`),
        type: 'skill',
        name: 'Test DELETE Skill',
        content: '# Test Content',
        mcpEnabled: false,
      }

      const createResponse = await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
        },
        body: JSON.stringify(newItem),
      })

      expect(createResponse.status).toBe(201)

      // Delete the item
      const deleteResponse = await fetch(`${API_BASE_URL}/api/catalog/${newItem.id}`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
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
        id: trackTestItem(`test-delete-unauthorized-${Date.now()}`),
        type: 'skill',
        name: 'Test Unauthorized DELETE',
        content: '# Test Content',
        mcpEnabled: false,
      }

      await fetch(`${API_BASE_URL}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-role': 'admin',
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
        headers: { 'x-test-user-role': 'admin' },
      })
    })

    it('should return 404 when deleting non-existent item', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/catalog/non-existent-id`, {
        method: 'DELETE',
        headers: {
          'x-test-user-role': 'admin',
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
        id: trackTestItem(`test-filter-skill-${Date.now()}`),
        type: 'skill',
        name: 'Test Filter Skill',
        author: 'test-author',
        content: '# Test Skill',
        mcpEnabled: false,
      }

      const agentItem = {
        id: trackTestItem(`test-filter-agent-${Date.now()}`),
        type: 'agent',
        name: 'Test Filter Agent',
        author: 'test-author',
        content: '# Test Agent',
        mcpEnabled: false,
      }

      const authorItem = {
        id: trackTestItem(`test-filter-author-${Date.now()}`),
        type: 'skill',
        name: 'Test Author Filter Skill',
        author: 'primadonna',
        content: '# Test Author',
        mcpEnabled: false,
      }

      const responses = await Promise.all([
        fetch(`${API_BASE_URL}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-role': 'admin',
          },
          body: JSON.stringify(skillItem),
        }),
        fetch(`${API_BASE_URL}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-role': 'admin',
          },
          body: JSON.stringify(agentItem),
        }),
        fetch(`${API_BASE_URL}/api/catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-user-role': 'admin',
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
          headers: { 'x-test-user-role': 'admin' },
        }),
        agentItemId && fetch(`${API_BASE_URL}/api/catalog/${agentItemId}`, {
          method: 'DELETE',
          headers: { 'x-test-user-role': 'admin' },
        }),
        authorItemId && fetch(`${API_BASE_URL}/api/catalog/${authorItemId}`, {
          method: 'DELETE',
          headers: { 'x-test-user-role': 'admin' },
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
