/**
 * Privacy opt-out integration tests
 *
 * Verifies MCP analytics opt-out via X-Analytics-Opt-Out header
 * and public access to the /privacy page.
 */
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

describe('Privacy & Opt-Out', () => {
  let serverAvailable = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    if (!serverAvailable) {
      console.log('Server not running, skipping privacy opt-out tests')
    }
  })

  describe('/privacy page', () => {
    it('should be accessible without authentication', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/privacy`, { redirect: 'manual' })
      // Should not redirect to signin — direct 200 response
      expect(response.status).toBe(200)
    })

    it('should contain privacy policy content', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/privacy`)
      const html = await response.text()
      expect(html).toContain('Privacy Policy')
      expect(html).toContain('X-Analytics-Opt-Out')
    })
  })

  describe('MCP opt-out header', () => {
    it('should accept X-Analytics-Opt-Out in CORS preflight', async () => {
      if (!serverAvailable) return

      const response = await fetch(`${API_BASE_URL}/api/mcp`, {
        method: 'OPTIONS',
      })
      const allowHeaders = response.headers.get('access-control-allow-headers') ?? ''
      expect(allowHeaders.toLowerCase()).toContain('x-analytics-opt-out')
    })

    it('should return normal MCP response with opt-out header', async () => {
      if (!serverAvailable) return

      // GET /api/mcp returns server info — should work regardless of opt-out
      const response = await fetch(`${API_BASE_URL}/api/mcp`, {
        headers: {
          'X-Analytics-Opt-Out': 'true',
        },
      })
      // May require auth (401) or succeed (200) — but should not error due to header
      expect([200, 401]).toContain(response.status)
    })
  })
})
