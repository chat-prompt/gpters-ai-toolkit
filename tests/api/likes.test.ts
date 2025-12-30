// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/api/catalog`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

describe('Likes API', () => {
  let serverAvailable = false
  let testItemId: string | null = null

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping likes API tests')
      return
    }

    // Create a test item to like
    testItemId = `likes-test-item-${Date.now()}`
    const response = await fetch(`${API_BASE_URL}/api/catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-role': 'admin',
      },
      body: JSON.stringify({
        id: testItemId,
        type: 'skill',
        name: 'Likes Test Skill',
        description: 'A skill for testing likes',
        author: 'test-author',
        content: '# Test Skill\n\nThis is for likes testing.',
      }),
    })

    if (!response.ok) {
      console.log('Failed to create test item for likes tests')
      testItemId = null
    }
  })

  afterAll(async () => {
    // Cleanup: delete the test item
    if (serverAvailable && testItemId) {
      try {
        await fetch(`${API_BASE_URL}/api/catalog/${testItemId}`, {
          method: 'DELETE',
          headers: {
            'x-test-user-role': 'admin',
          },
        })
      } catch (error) {
        console.log('Failed to cleanup test item:', testItemId, error)
      }
    }
  })

  describe('GET /api/likes/[id]', () => {
    it('should get likes count for an item', async () => {
      if (!serverAvailable || !testItemId) return

      const response = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.likes).toBeDefined()
      expect(typeof data.likes).toBe('number')
      expect(data.likes).toBeGreaterThanOrEqual(0)
    })

    it('should return 404 for non-existent item', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/likes/non-existent-item-12345`)

      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should have correct content-type', async () => {
      if (!serverAvailable || !testItemId) return

      const response = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`)

      expect(response.status).toBe(200)

      const contentType = response.headers.get('content-type')
      expect(contentType).toContain('application/json')
    })
  })

  describe('POST /api/likes/[id]', () => {
    it('should increment likes count', async () => {
      if (!serverAvailable || !testItemId) return

      // Get initial likes count
      const initialResponse = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`)
      const initialData = await initialResponse.json()
      const initialLikes = initialData.likes

      // Increment likes
      const response = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`, {
        method: 'POST',
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.likes).toBe(initialLikes + 1)
    })

    it('should increment likes multiple times', async () => {
      if (!serverAvailable || !testItemId) return

      // Get current likes count
      const initialResponse = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`)
      const initialData = await initialResponse.json()
      const initialLikes = initialData.likes

      // Increment likes twice
      await fetch(`${API_BASE_URL}/api/likes/${testItemId}`, { method: 'POST' })
      const response = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`, {
        method: 'POST',
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.likes).toBe(initialLikes + 2)
    })

    it('should return 404 for non-existent item', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/likes/non-existent-item-12345`, {
        method: 'POST',
      })

      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should have correct content-type in response', async () => {
      if (!serverAvailable || !testItemId) return

      const response = await fetch(`${API_BASE_URL}/api/likes/${testItemId}`, {
        method: 'POST',
      })

      expect(response.status).toBe(200)

      const contentType = response.headers.get('content-type')
      expect(contentType).toContain('application/json')
    })
  })
})
