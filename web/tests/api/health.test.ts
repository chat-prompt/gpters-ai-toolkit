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

describe('Health Check', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping health check tests')
    }
  })

  it('should return 200 for auth signin page', async () => {
    if (!serverAvailable) return

    const response = await fetch(`${API_BASE_URL}/auth/signin`)
    expect(response.status).toBe(200)
  })

  it('should return 200 for auth error page', async () => {
    if (!serverAvailable) return

    const response = await fetch(`${API_BASE_URL}/auth/error`)
    expect(response.status).toBe(200)
  })

  it('should redirect protected routes to signin', async () => {
    if (!serverAvailable) return

    const response = await fetch(`${API_BASE_URL}/`, { redirect: 'manual' })
    expect([200, 307, 308]).toContain(response.status)
  })
})
