/**
 * AX 대시보드 — 공유 스킬(bbopters-shared) 패널 테스트
 *
 * GitHub API는 fetch 모킹으로 대체하고, 다음을 검증한다:
 * 1. 환경변수 누락 시 error가 아니라 not_configured로 응답하는지
 * 2. git tree에서 스킬 디렉터리와 SKILL.md 유무를 올바르게 추리는지
 * 3. truncated·API 실패·캐시 동작이 안전한지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const { sharedSkillsPanel, __resetSharedSkillsCache } = await import(
  '../../../../packages/lib/src/features/ax/shared-skills'
)

const CTX = { days: 30, isAdmin: false }

/** fetch가 돌려줄 git tree 응답을 큐에 넣는다 */
function mockTree(tree: Array<{ path: string; type: string }>, truncated = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ tree, truncated }),
    }))
  )
}

describe('sharedSkillsPanel', () => {
  beforeEach(() => {
    __resetSharedSkillsCache()
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
    expect(sharedSkillsPanel.meta.id).toBe('shared-skills')
    expect(sharedSkillsPanel.meta.visibility).toBe('org')
    expect(sharedSkillsPanel.meta.usesPeriod).toBe(false)
  })

  it('저장소 환경변수가 없으면 not_configured로 응답한다', async () => {
    delete process.env.BBOPTERS_SHARED_REPO

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.status).toBe('not_configured')
    expect(result.data).toBeNull()
    expect(result.message).toContain('BBOPTERS_SHARED_REPO')
  })

  it('토큰이 없으면 not_configured로 응답한다', async () => {
    delete process.env.GH_TOKEN

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.status).toBe('not_configured')
    expect(result.message).toContain('GH_TOKEN')
  })

  it('tree에서 스킬 디렉터리와 SKILL.md 유무를 추린다', async () => {
    mockTree([
      { path: 'skills', type: 'tree' },
      { path: 'skills/review-helper', type: 'tree' },
      { path: 'skills/review-helper/SKILL.md', type: 'blob' },
      { path: 'skills/data-sync', type: 'tree' },
      { path: 'skills/data-sync/scripts/run.mjs', type: 'blob' },
      { path: 'skills/alpha-tool/SKILL.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      { path: 'docs/guide.md', type: 'blob' },
    ])

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.status).toBe('ok')
    const data = result.data!
    expect(data.repo).toBe('geniefy/bbopters-shared')
    // id 오름차순 정렬
    expect(data.skills).toEqual([
      { id: 'alpha-tool', path: 'skills/alpha-tool', hasSkillDoc: true },
      { id: 'data-sync', path: 'skills/data-sync', hasSkillDoc: false },
      { id: 'review-helper', path: 'skills/review-helper', hasSkillDoc: true },
    ])
    // 실행 이벤트는 아직 미연결 — 화면이 이 값을 보고 상태를 밝힌다
    expect(data.eventsConnected).toBe(false)
    expect(data.truncated).toBe(false)
    expect(result.highlights).toEqual([{ label: '공유 스킬', value: '3', hint: '개' }])
  })

  it('tree가 잘렸으면 truncated를 그대로 전달한다', async () => {
    mockTree([{ path: 'skills/one/SKILL.md', type: 'blob' }], true)

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.data!.truncated).toBe(true)
  })

  it('API가 실패하면 throw하지 않고 error 상태를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    )

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })

  it('TTL 안에서는 캐시를 재사용해 API를 다시 부르지 않는다', async () => {
    mockTree([{ path: 'skills/one/SKILL.md', type: 'blob' }])

    const first = await sharedSkillsPanel.load(CTX)
    const second = await sharedSkillsPanel.load(CTX)

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    // 캐시는 결과 전체를 보존한다 — 조회 시각(generatedAt)도 그대로여야
    // 오래된 데이터가 "방금"으로 표시되지 않는다
    expect(second.generatedAt).toBe(first.generatedAt)
  })

  it('스킬 경로 환경변수를 바꾸면 그 경로에서 추린다', async () => {
    process.env.BBOPTERS_SHARED_SKILLS_PATH = 'packages/skills'
    mockTree([
      { path: 'packages/skills/custom/SKILL.md', type: 'blob' },
      { path: 'skills/ignored/SKILL.md', type: 'blob' },
    ])

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.data!.skills).toEqual([
      { id: 'custom', path: 'packages/skills/custom', hasSkillDoc: true },
    ])
  })

  it('경로 끝의 슬래시를 정규화한다 — "skills/"가 빈 목록이 되면 안 된다', async () => {
    process.env.BBOPTERS_SHARED_SKILLS_PATH = 'skills/'
    mockTree([{ path: 'skills/one/SKILL.md', type: 'blob' }])

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.data!.skills).toHaveLength(1)
  })

  it('설정(경로)이 바뀌면 캐시를 쓰지 않고 다시 조회한다', async () => {
    mockTree([{ path: 'skills/one/SKILL.md', type: 'blob' }])
    await sharedSkillsPanel.load(CTX)

    process.env.BBOPTERS_SHARED_SKILLS_PATH = 'packages/skills'
    mockTree([{ path: 'packages/skills/two/SKILL.md', type: 'blob' }])
    const result = await sharedSkillsPanel.load(CTX)

    // 옛 경로의 캐시가 새 설정에 서빙되면 안 된다
    expect(result.data!.skills[0].id).toBe('two')
  })
})
