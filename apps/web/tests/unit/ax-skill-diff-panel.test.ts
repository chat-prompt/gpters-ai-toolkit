/**
 * AX 대시보드 — 스킬 비교 패널 테스트
 *
 * db와 GitHub fetch를 모킹하고, 이름·내용 대조의 네 갈래 분류
 * (동일 · 유사 · 다름 · 교차 일치)와 경계 동작을 검증한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  catalogItems: {
    id: 'catalog_items.id',
    content: 'catalog_items.content',
    type: 'catalog_items.type',
    status: 'catalog_items.status',
  },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const { skillDiffPanel, __resetSkillDiffCache, normalizeSkillDoc, trigramSimilarity } =
  await import('../../../../packages/lib/src/features/ax/skill-diff')
const { db } = await import('@gpters/db')

const CTX = { days: 30, isAdmin: false }

/** 어떤 체이닝에도 자신을 돌려주고, await 하면 결과를 내는 쿼리 빌더 */
function dbBuilder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'where']) {
    stub[method] = vi.fn(() => stub)
  }
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

/** aitk 카탈로그 스킬(id, content)을 큐에 넣는다 */
function mockAitk(rows: Array<{ id: string; content: string }>) {
  vi.mocked(db.select).mockReset()
  vi.mocked(db.select).mockReturnValue(dbBuilder(rows) as never)
}

/**
 * GitHub fetch 라우팅 — tree와 스킬별 SKILL.md 내용
 *
 * @param agentDocs - 에이전트 스킬 id → SKILL.md 원문. 값이 null이면 404
 */
function mockGitHub(agentDocs: Record<string, string | null>) {
  const tree = Object.keys(agentDocs).map((id) => ({ path: `skills/${id}/SKILL.md`, type: 'blob' }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/git/trees/')) {
        return { ok: true, status: 200, json: async () => ({ tree, truncated: false }) }
      }
      const match = u.match(/contents\/skills\/([^/]+)\/SKILL\.md/)
      const doc = match ? agentDocs[match[1]] : null
      if (doc === null || doc === undefined) return { ok: false, status: 404, json: async () => ({}) }
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: Buffer.from(doc, 'utf-8').toString('base64') }),
      }
    })
  )
}

describe('normalizeSkillDoc · trigramSimilarity', () => {
  it('frontmatter와 공백 차이는 내용 차이로 치지 않는다', () => {
    const a = '---\nname: x\n---\n# 제목\n\n본문  내용'
    const b = '---\nname: y\nversion: 2\n---\n# 제목\n본문 내용'
    expect(normalizeSkillDoc(a)).toBe(normalizeSkillDoc(b))
  })

  it('같은 문서는 1, 무관한 문서는 0에 가깝다', () => {
    expect(trigramSimilarity('동일한 본문입니다', '동일한 본문입니다')).toBe(1)
    expect(trigramSimilarity('완전히 다른 이야기라서', '겹치는 글자가 거의 없다')).toBeLessThan(0.2)
  })
})

describe('skillDiffPanel', () => {
  beforeEach(() => {
    __resetSkillDiffCache()
    process.env.BBOPTERS_SHARED_REPO = 'geniefy/bbopters-shared'
    process.env.GH_TOKEN = 'test-token'
    delete process.env.BBOPTERS_SHARED_SKILLS_PATH
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.BBOPTERS_SHARED_REPO
    delete process.env.GH_TOKEN
  })

  it('meta가 레지스트리 계약과 일치한다', () => {
    expect(skillDiffPanel.meta.id).toBe('skill-diff')
    expect(skillDiffPanel.meta.visibility).toBe('org')
    expect(skillDiffPanel.meta.usesPeriod).toBe(false)
  })

  it('환경변수가 없으면 not_configured로 응답한다', async () => {
    delete process.env.BBOPTERS_SHARED_REPO

    const result = await skillDiffPanel.load(CTX)

    expect(result.status).toBe('not_configured')
    expect(result.message).toContain('BBOPTERS_SHARED_REPO')
  })

  it('동일·유사·다름·교차 일치를 분류한다', async () => {
    const longDoc = '공통 문장이 길게 이어지는 본문입니다. '.repeat(20)
    mockAitk([
      { id: 'same-skill', content: '# 같음\n\n완전히 같은 본문' },
      { id: 'drift-skill', content: longDoc },
      { id: 'homonym-skill', content: '사람용 스킬의 짧은 설명' },
      { id: 'renamed-here', content: '이름만 다른 동일 문서 본문' },
      { id: 'aitk-only', content: '에이전트 쪽에는 없는 스킬' },
    ])
    mockGitHub({
      'same-skill': '---\nver: 2\n---\n# 같음\n완전히   같은 본문',
      'drift-skill': longDoc + ' 에이전트 쪽에서 한 문장이 추가됐다.',
      'homonym-skill': '에이전트 전용으로 완전히 재작성된 전혀 무관한 장문의 자동화 절차서',
      'agent-alias': '이름만 다른 동일 문서 본문',
    })

    const result = await skillDiffPanel.load(CTX)
    expect(result.status).toBe('ok')
    const data = result.data!

    expect(data.identical.map((r) => r.id)).toEqual(['same-skill'])
    expect(data.similar.map((r) => r.id)).toEqual(['drift-skill'])
    expect(data.different.map((r) => r.id)).toEqual(['homonym-skill'])
    // 이름은 다른데 내용이 같은 쌍
    expect(data.crossMatches).toEqual([{ aitkId: 'renamed-here', agentId: 'agent-alias' }])
    expect(data.basis.comparedDocs).toBe(3)
    expect(data.fetchFailures).toBe(0)
  })

  it('문서를 못 가져온 스킬은 판정하지 않고 실패로 센다', async () => {
    mockAitk([{ id: 'broken', content: '본문' }])
    mockGitHub({ broken: null })

    const data = (await skillDiffPanel.load(CTX)).data!

    expect(data.basis.comparedDocs).toBe(0)
    expect(data.fetchFailures).toBe(1)
  })

  it('TTL 안에서는 캐시를 재사용한다', async () => {
    mockAitk([{ id: 'one', content: '본문' }])
    mockGitHub({ one: '본문' })

    const first = await skillDiffPanel.load(CTX)
    const second = await skillDiffPanel.load(CTX)

    expect(second.generatedAt).toBe(first.generatedAt)
  })

  it('GitHub 조회가 실패하면 throw하지 않고 error 상태를 반환한다', async () => {
    mockAitk([])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))

    const result = await skillDiffPanel.load(CTX)

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })
})
