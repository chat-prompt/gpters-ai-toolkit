/**
 * AX 대시보드 — 공유 스킬(bbopters-shared) 패널 테스트
 *
 * GitHub API는 fetch 모킹으로 대체하고, 다음을 검증한다:
 * 1. 환경변수 누락 시 error가 아니라 not_configured로 응답하는지
 * 2. git tree에서 스킬 디렉터리와 SKILL.md 유무를 올바르게 추리는지
 * 3. truncated·API 실패·캐시 동작이 안전한지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 겹침 판정용 카탈로그 조회와 에이전트 스킬 로드 조회를 모킹한다
vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  catalogItems: {
    id: 'catalog_items.id',
    type: 'catalog_items.type',
    status: 'catalog_items.status',
  },
  axAgentTelemetryBatches: {
    windowEnd: 'ax_agent_telemetry_batches.window_end',
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

const { sharedSkillsPanel, __resetSharedSkillsCache } = await import(
  '../../../../packages/lib/src/features/ax/shared-skills'
)
const { db, catalogItems, axAgentTelemetryBatches } = await import('@gpters/db')

const CTX = { days: 30, isAdmin: false }

/** 텔레메트리 배치 한 건 — 테스트가 필요한 필드만 채운다 */
interface TestBatch {
  agentId: string
  source: string
  collectorVersion: string
  /** 수집 창 시작·끝 (epoch ms). 기본은 최근 */
  windowStart?: number
  windowEnd?: number
  skillLoads: Array<{ skillId: string; loaded: number }>
}

/** `from(table)`이 어느 테이블인지 보고 결과를 갈라 주는 쿼리 빌더 */
function dbBuilder(byTable: Map<unknown, unknown>) {
  const stub: Record<string, unknown> = {}
  let table: unknown
  stub.from = vi.fn((value: unknown) => {
    table = value
    return stub
  })
  stub.where = vi.fn(() => stub)
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(byTable.get(table) ?? []).then(resolve, reject)
  return stub
}

/**
 * 카탈로그 스킬 id와 텔레메트리 배치를 함께 모킹한다
 *
 * @param ids - aitk 카탈로그에 등록된 스킬 id
 * @param batches - 텔레메트리 배치. 생략하면 배치 0건(= 미관측)
 */
function mockDb(ids: string[], batches: TestBatch[] = []) {
  const now = Date.now()
  const rows = batches.map((batch) => ({
    agentId: batch.agentId,
    windowStart: new Date(batch.windowStart ?? now - 3_600_000),
    windowEnd: new Date(batch.windowEnd ?? now - 60_000),
    runtime: { collectorVersion: batch.collectorVersion },
    collection: { source: batch.source },
    skillLoads: batch.skillLoads,
  }))
  // from()에 넘어오는 테이블 객체로 결과를 가른다 — 카탈로그와 배치가 같은 db.select를 쓴다
  const byTable = new Map<unknown, unknown>([
    [catalogItems, ids.map((id) => ({ id }))],
    [axAgentTelemetryBatches, rows],
  ])
  vi.mocked(db.select).mockReset()
  vi.mocked(db.select).mockImplementation((() => dbBuilder(byTable) as never) as never)
}

/** 하위 호환 별칭 — 카탈로그만 지정하는 기존 테스트용 */
const mockCatalog = (ids: string[]) => mockDb(ids)

/**
 * fetch를 URL별로 라우팅해 모킹한다
 *
 * @param tree - git trees 응답
 * @param truncated - tree 잘림 여부
 * @param commits - 커밋 통계 응답. 'pending'이면 202(계산 중)
 * @param commitList - 통계 폴백에 쓸 커밋 시각 목록
 */
function mockGitHub(
  tree: Array<{ path: string; type: string }>,
  truncated = false,
  commits: Array<{ week: number; days: number[] }> | 'pending' = [],
  commitList?: string[]
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/stats/commit_activity')) {
        if (commits === 'pending') return { ok: false, status: 202, json: async () => ({}) }
        return { ok: true, status: 200, json: async () => commits }
      }
      if (String(url).includes('/commits?') && commitList) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            commitList.map((date) => ({ commit: { committer: { date } } })),
        }
      }
      return { ok: true, status: 200, json: async () => ({ tree, truncated }) }
    })
  )
}

/** 하위 호환 별칭 — tree만 지정하는 기존 테스트용 */
const mockTree = mockGitHub

describe('sharedSkillsPanel', () => {
  beforeEach(() => {
    __resetSharedSkillsCache()
    process.env.BBOPTERS_SHARED_REPO = 'geniefy/bbopters-shared'
    process.env.GH_TOKEN = 'test-token'
    delete process.env.BBOPTERS_SHARED_SKILLS_PATH
    mockCatalog([])
  })

  afterEach(() => {
    vi.useRealTimers()
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
    expect(data.skills.map((skill) => ({
      id: skill.id, path: skill.path, hasSkillDoc: skill.hasSkillDoc, inAitk: skill.inAitk,
    }))).toEqual([
      { id: 'alpha-tool', path: 'skills/alpha-tool', hasSkillDoc: true, inAitk: false },
      { id: 'data-sync', path: 'skills/data-sync', hasSkillDoc: false, inAitk: false },
      { id: 'review-helper', path: 'skills/review-helper', hasSkillDoc: true, inAitk: false },
    ])
    expect(data.aitkOverlap).toBe(0)
    // 관측 가능한 배치가 없으면 사용량은 0이 아니라 미관측이다
    expect(data.eventsConnected).toBe(false)
    expect(data.skills.every((skill) => skill.agentLoads === null)).toBe(true)
    expect(data.truncated).toBe(false)
    expect(result.highlights).toEqual([{ label: '에이전트 스킬', value: '3', hint: '개' }])
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

    // tree + 커밋 통계 + 커밋 목록 폴백 각 1회 — 두 번째 load는 캐시라 추가 호출이 없다
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
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

    expect(result.data!.skills.map((skill) => ({
      id: skill.id, path: skill.path, hasSkillDoc: skill.hasSkillDoc,
    }))).toEqual([
      { id: 'custom', path: 'packages/skills/custom', hasSkillDoc: true },
    ])
  })

  it('aitk 카탈로그와 id가 겹치는 스킬을 표시하고 수는 합산하지 않는다', async () => {
    mockCatalog(['alpha-tool', 'unrelated-team-skill'])
    mockTree([
      { path: 'skills/alpha-tool/SKILL.md', type: 'blob' },
      { path: 'skills/agent-only/SKILL.md', type: 'blob' },
    ])

    const result = await sharedSkillsPanel.load(CTX)
    const data = result.data!

    expect(data.skills.find((s) => s.id === 'alpha-tool')?.inAitk).toBe(true)
    expect(data.skills.find((s) => s.id === 'agent-only')?.inAitk).toBe(false)
    expect(data.aitkOverlap).toBe(1)
    // 겹침이 있어도 인벤토리 수는 저장소 기준 그대로다
    expect(result.highlights?.[0]?.value).toBe('2')
  })

  it('카탈로그 조회가 실패하면 겹침을 0으로 꾸미지 않고 null로 둔다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error('연결 끊김')
    })
    mockTree([{ path: 'skills/one/SKILL.md', type: 'blob' }])

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.status).toBe('ok')
    expect(result.data!.aitkOverlap).toBeNull()
    expect(result.data!.skills[0].inAitk).toBe(false)
  })

  it('커밋 통계를 일별 시리즈로 펼친다 (오늘 이후 날짜 제외)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'))
    mockGitHub([{ path: 'skills/one/SKILL.md', type: 'blob' }], false, [
      {
        week: Math.floor(new Date('2026-08-09T00:00:00Z').getTime() / 1000),
        days: [0, 5, 2, 0, 0, 1, 0],
      },
    ])

    const result = await sharedSkillsPanel.load(CTX)
    const daily = result.data!.commitDaily!

    expect(daily.find((d) => d.date === '2026-08-10')?.events).toBe(5)
    expect(daily.find((d) => d.date === '2026-08-11')?.events).toBe(2)
    expect(daily).toHaveLength(365)
    expect(daily[0].date).toBe('2025-08-25')
    expect(daily.at(-1)?.date).toBe('2026-08-24')
    vi.useRealTimers()
  })

  it('통계 API와 커밋 목록 폴백을 같은 365일 날짜 축으로 정규화한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'))
    const tree = [{ path: 'skills/one/SKILL.md', type: 'blob' }]
    const week = Math.floor(new Date('2026-08-16T00:00:00Z').getTime() / 1000)

    mockGitHub(tree, false, [{ week, days: [1, 2, 0, 1, 0, 0, 0] }])
    const fromStats = (await sharedSkillsPanel.load(CTX)).data!.commitDaily

    __resetSharedSkillsCache()
    mockCatalog([])
    mockGitHub(tree, false, 'pending', [
      '2026-08-16T01:00:00Z',
      '2026-08-17T01:00:00Z',
      '2026-08-17T02:00:00Z',
      '2026-08-19T01:00:00Z',
      // 같은 API 응답에 섞여도 고정 창 밖 데이터는 버린다.
      '2025-08-24T23:59:59Z',
      '2026-08-25T00:00:00Z',
    ])
    const fromList = (await sharedSkillsPanel.load(CTX)).data!.commitDaily

    expect(fromList).toEqual(fromStats)
    expect(fromList).toHaveLength(365)
    vi.useRealTimers()
  })

  it('커밋 통계가 계산 중(202)이면 잔디를 0으로 꾸미지 않고 null로 둔다', async () => {
    mockGitHub([{ path: 'skills/one/SKILL.md', type: 'blob' }], false, 'pending')

    const result = await sharedSkillsPanel.load(CTX)

    expect(result.status).toBe('ok')
    expect(result.data!.commitDaily).toBeNull()
  })

  it('커밋 시리즈 실패도 캐시된다 — 분당 재시도 루프를 만들지 않는다', async () => {
    // 통계 202 + 폴백도 실패(라우터가 커밋 목록에 트리 객체를 줘 배열 파싱 실패)
    mockGitHub([{ path: 'skills/one/SKILL.md', type: 'blob' }], false, 'pending')

    await sharedSkillsPanel.load(CTX)
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length

    // 실패했어도 같은 인스턴스의 후속 로드는 부정 캐시에 맞아 재요청하지 않는다
    await sharedSkillsPanel.load(CTX)

    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterFirst)
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

  describe('에이전트 스킬 로드 (DEV-4221)', () => {
    const TREE = [
      { path: 'skills/session-cleanup/SKILL.md', type: 'blob' },
      { path: 'skills/broadcast-abort/SKILL.md', type: 'blob' },
      { path: 'skills/never-used/SKILL.md', type: 'blob' },
    ]

    it('관측 가능한 배치의 로드를 스킬에 붙이고 미사용 스킬은 0으로 둔다', async () => {
      mockDb([], [{
        agentId: 'bbokeoter',
        source: 'hermes',
        collectorVersion: '0.7.8',
        skillLoads: [{ skillId: 'session-cleanup', loaded: 3 }],
      }])
      mockTree(TREE)

      const data = (await sharedSkillsPanel.load(CTX)).data!

      expect(data.eventsConnected).toBe(true)
      expect(data.observedAgents).toBe(1)
      expect(data.usageWindowDays).toBe(30)
      const used = data.skills.find((skill) => skill.id === 'session-cleanup')!
      expect(used.agentLoads).toBe(3)
      expect(used.agentCount).toBe(1)
      expect(used.lastLoadedAt).not.toBeNull()
      expect(used.matchedByName).toBe(false)
      // 관측은 됐으므로 안 쓰인 스킬은 null이 아니라 0이다 — "안 씀"과 "미관측"은 다르다
      expect(data.skills.find((skill) => skill.id === 'never-used')!.agentLoads).toBe(0)
      expect(data.matchedLoads).toBe(3)
    })

    it('네임스페이스 접두어를 뗀 이름으로 맞추고 그 사실을 표시한다', async () => {
      mockDb([], [{
        agentId: 'bbokeoter',
        source: 'hermes',
        collectorVersion: '0.7.8',
        skillLoads: [{ skillId: 'openclaw-skills:session-cleanup', loaded: 2 }],
      }])
      mockTree(TREE)

      const skill = (await sharedSkillsPanel.load(CTX)).data!
        .skills.find((row) => row.id === 'session-cleanup')!

      expect(skill.agentLoads).toBe(2)
      expect(skill.matchedByName).toBe(true)
    })

    it('저장소에 없는 스킬 로드는 unmatchedLoads로 분리한다', async () => {
      mockDb([], [{
        agentId: 'bbokeoter',
        source: 'hermes',
        collectorVersion: '0.7.8',
        skillLoads: [
          { skillId: 'session-cleanup', loaded: 1 },
          { skillId: 'slack-agent-communication', loaded: 7 },
          { skillId: 'google-workspace', loaded: 4 },
        ],
      }])
      mockTree(TREE)

      const data = (await sharedSkillsPanel.load(CTX)).data!

      expect(data.totalObservedLoads).toBe(12)
      expect(data.matchedLoads).toBe(1)
      // 로드 많은 순 — 저장소가 실제 스킬 출처가 아니라는 사실이 먼저 보여야 한다
      expect(data.unmatchedLoads).toEqual([
        { id: 'slack-agent-communication', loads: 7 },
        { id: 'google-workspace', loads: 4 },
      ])
    })

    it('스킬 신호를 못 보내는 구버전 배치는 0이 아니라 미관측으로 둔다', async () => {
      mockDb([], [{
        agentId: 'bbokeoter',
        source: 'hermes',
        // hermes는 0.7.5부터 skill_view를 스킬 로드로 센다
        collectorVersion: '0.7.1',
        skillLoads: [],
      }])
      mockTree(TREE)

      const data = (await sharedSkillsPanel.load(CTX)).data!

      expect(data.eventsConnected).toBe(false)
      expect(data.observedAgents).toBe(0)
      expect(data.skills.every((skill) => skill.agentLoads === null)).toBe(true)
    })

    it('집계 창에 걸친 배치는 통째로 제외한다 — 부분 배분은 하지 않는다', async () => {
      const now = Date.now()
      mockDb([], [{
        agentId: 'bbokeoter',
        source: 'hermes',
        collectorVersion: '0.7.8',
        // 창 시작 이전에 시작해 창 안에서 끝나는 배치
        windowStart: now - 40 * 86_400_000,
        windowEnd: now - 60_000,
        skillLoads: [{ skillId: 'session-cleanup', loaded: 99 }],
      }])
      mockTree(TREE)

      const data = (await sharedSkillsPanel.load(CTX)).data!

      expect(data.eventsConnected).toBe(false)
      expect(data.totalObservedLoads).toBe(0)
    })

    it('스킬 신호를 못 보내는 소스(codex)의 배치는 관측으로 세지 않는다', async () => {
      mockDb([], [{
        agentId: 'codex',
        source: 'codex',
        collectorVersion: '0.7.8',
        skillLoads: [{ skillId: 'session-cleanup', loaded: 5 }],
      }])
      mockTree(TREE)

      const data = (await sharedSkillsPanel.load(CTX)).data!

      expect(data.eventsConnected).toBe(false)
      expect(data.totalObservedLoads).toBe(0)
    })
  })
})
