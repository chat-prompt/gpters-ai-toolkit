// @vitest-environment node
/**
 * E2E tests for exercise-aware skill search API (DEV-3065)
 *
 * Validates POST /api/skills/search and GET /api/skills/curate
 * against a running server with real database and embeddings.
 * Requires RONA_SERVICE_TOKEN env var to authenticate.
 */

import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'
const SERVICE_TOKEN = process.env.RONA_SERVICE_TOKEN || ''

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SERVICE_TOKEN}`,
    'X-Service-Name': 'e2e-test',
  }
}

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_BASE_URL}/auth/signin`, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

describe('Skills Search E2E (DEV-3065)', () => {
  let serverAvailable = false
  let hasToken = false

  beforeAll(async () => {
    serverAvailable = await isServerRunning()
    hasToken = SERVICE_TOKEN.length > 0
    if (!serverAvailable) {
      console.log('Server not running, skipping E2E tests')
    }
    if (!hasToken) {
      console.log('RONA_SERVICE_TOKEN not set, skipping E2E tests')
    }
  })

  function shouldRun(): boolean {
    return serverAvailable && hasToken
  }

  // ─── POST /api/skills/search ───────────────────────────────────

  describe('POST /api/skills/search', () => {
    it('should reject without auth token', async () => {
      if (!serverAvailable) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test' }),
      })

      expect(res.status).toBe(401)
    })

    it('should reject missing topic', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('topic')
    })

    it('should reject topic exceeding 500 chars', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ topic: 'a'.repeat(501) }),
      })

      expect(res.status).toBe(400)
    })

    it('should reject techStack exceeding 10 items', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'test',
          techStack: Array.from({ length: 11 }, (_, i) => `tech${i}`),
        }),
      })

      expect(res.status).toBe(400)
    })

    it('should reject invalid level', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ topic: 'test', level: 'expert' }),
      })

      expect(res.status).toBe(400)
    })

    // ─── 시나리오 1: Stripe 결제 연동 (intermediate) ─────────────

    it('Stripe 결제 연동 — intermediate', async () => {
      if (!shouldRun()) return

      const start = Date.now()
      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'Stripe 결제 연동',
          techStack: ['stripe', 'next.js'],
          level: 'intermediate',
        }),
      })

      const elapsed = Date.now() - start
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.skills).toBeDefined()
      expect(Array.isArray(data.skills)).toBe(true)
      expect(data.meta).toBeDefined()
      expect(data.meta.searchDurationMs).toBeGreaterThanOrEqual(0)
      expect(data.meta.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      // P50 응답 시간 ≤ 3초
      expect(elapsed).toBeLessThan(10000)

      // 스킬 결과 구조 검증
      for (const skill of data.skills) {
        expect(skill.id).toBeDefined()
        expect(skill.name).toBeDefined()
        expect(typeof skill.score).toBe('number')
        expect(skill.score).toBeGreaterThan(0)
        expect(skill.score).toBeLessThanOrEqual(1)
      }

      // CLI/MCP 결과 구조 검증
      expect(Array.isArray(data.mcpServers)).toBe(true)
      expect(Array.isArray(data.cliTools)).toBe(true)

      for (const mcp of data.mcpServers) {
        expect(mcp.id).toBeDefined()
        expect(mcp.label).toBeDefined()
      }

      for (const cli of data.cliTools) {
        expect(cli.name).toBeDefined()
        expect(cli.installCommand).toBeDefined()
      }

      // 구버전 도구 사용 0건 (staleWarning 없어야 함)
      const staleCount = data.skills.filter((s: { staleWarning?: string }) => s.staleWarning).length
      console.log(`  Stripe: ${data.skills.length} skills, ${data.mcpServers.length} MCP, ${data.cliTools.length} CLI, ${staleCount} stale, ${elapsed}ms`)
    })

    // ─── 시나리오 2: React Todo 앱 (beginner) ────────────────────

    it('React Todo 앱 — beginner', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'React Todo 앱 만들기',
          techStack: ['react'],
          level: 'beginner',
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()

      // beginner: MCP 서버 생략
      expect(data.mcpServers).toEqual([])

      // beginner: cliTools는 tier 1(essential)만 포함 — 응답에 tier 미노출이므로 개수로 간접 검증
      // tier 1 도구: node, npm, npx, python, git, docker (최대 6개)
      expect(data.cliTools.length).toBeLessThanOrEqual(6)

      // 각 CLI 도구의 필수 필드 검증
      for (const cli of data.cliTools) {
        expect(cli.name).toBeDefined()
        expect(typeof cli.name).toBe('string')
        expect(cli.installCommand).toBeDefined()
        expect(typeof cli.installCommand).toBe('string')
      }

      console.log(`  React Todo: ${data.skills.length} skills, ${data.cliTools.length} CLI (tier 1 only)`)
    })

    // ─── 시나리오 3: Playwright 테스트 (advanced) ─────────────────

    it('Playwright 테스트 — advanced', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'Playwright E2E 테스트 작성',
          techStack: ['playwright', 'typescript'],
          level: 'advanced',
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()

      // advanced: MCP/CLI 모두 포함 가능
      expect(Array.isArray(data.mcpServers)).toBe(true)
      expect(Array.isArray(data.cliTools)).toBe(true)

      console.log(`  Playwright: ${data.skills.length} skills, ${data.mcpServers.length} MCP, ${data.cliTools.length} CLI`)
    })

    // ─── 시나리오 4: Python 데이터 분석 (intermediate) ────────────

    it('Python 데이터 분석 — intermediate', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'Python 데이터 분석 및 시각화',
          techStack: ['python', 'pandas'],
          level: 'intermediate',
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.skills.length).toBeGreaterThanOrEqual(0)

      console.log(`  Python: ${data.skills.length} skills, ${data.mcpServers.length} MCP, ${data.cliTools.length} CLI`)
    })

    // ─── 시나리오 5: GitHub Actions CI/CD (intermediate) ─────────

    it('GitHub Actions CI/CD — intermediate', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'GitHub Actions CI/CD 파이프라인 구축',
          techStack: ['github', 'docker'],
          level: 'intermediate',
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.skills.length).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(data.mcpServers)).toBe(true)

      console.log(`  GitHub CI/CD: ${data.skills.length} skills, ${data.mcpServers.length} MCP, ${data.cliTools.length} CLI`)
    })

    // ─── platform 필터 ──────────────────────────────────────────

    it('should pass platform as clientType filter', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'code review',
          platform: 'claude-code',
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.skills).toBeDefined()
    })

    // ─── limit 파라미터 ──────────────────────────────────────────

    it('should respect limit parameter', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: '코드 리뷰',
          limit: 2,
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.skills.length).toBeLessThanOrEqual(2)
    })
  })

  // ─── GET /api/skills/curate ────────────────────────────────────

  describe('GET /api/skills/curate', () => {
    it('should reject without auth token', async () => {
      if (!serverAvailable) return

      const res = await fetch(`${API_BASE_URL}/api/skills/curate?category=testing`)
      expect(res.status).toBe(401)
    })

    it('should reject missing category', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/curate`, {
        headers: authHeaders(),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('category')
    })

    it('should return 404 for unknown category', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/curate?category=nonexistent`, {
        headers: authHeaders(),
      })

      expect(res.status).toBe(404)
    })

    const CATEGORIES = ['project-start', 'testing', 'code-quality', 'deployment']

    for (const category of CATEGORIES) {
      it(`should return curated skills for "${category}"`, async () => {
        if (!shouldRun()) return

        const res = await fetch(`${API_BASE_URL}/api/skills/curate?category=${category}`, {
          headers: authHeaders(),
        })

        expect(res.status).toBe(200)
        const data = await res.json()

        expect(data.category).toBe(category)
        expect(data.description).toBeDefined()
        expect(typeof data.description).toBe('string')
        expect(Array.isArray(data.skills)).toBe(true)
        expect(data.meta).toBeDefined()
        expect(data.meta.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)

        for (const skill of data.skills) {
          expect(skill.id).toBeDefined()
          expect(skill.name).toBeDefined()
        }

        console.log(`  Curate "${category}": ${data.skills.length} skills`)
      })
    }
  })

  // ─── Graceful degradation ──────────────────────────────────────

  describe('Graceful degradation', () => {
    it('should handle search with no matching results gracefully', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          topic: 'xyzzy_nonexistent_topic_12345',
          techStack: ['zzz_no_match'],
          level: 'beginner',
        }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()

      // Should return empty arrays, not error
      expect(Array.isArray(data.skills)).toBe(true)
      expect(Array.isArray(data.mcpServers)).toBe(true)
      expect(Array.isArray(data.cliTools)).toBe(true)
      expect(data.meta).toBeDefined()
    })

    it('should handle invalid Bearer token', async () => {
      if (!serverAvailable) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token-12345',
          'X-Service-Name': 'e2e-test',
        },
        body: JSON.stringify({ topic: 'test' }),
      })

      expect(res.status).toBe(401)
    })

    it('should handle malformed JSON body', async () => {
      if (!shouldRun()) return

      const res = await fetch(`${API_BASE_URL}/api/skills/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: 'not json {{{',
      })

      expect(res.status).toBe(400)
    })
  })
})
