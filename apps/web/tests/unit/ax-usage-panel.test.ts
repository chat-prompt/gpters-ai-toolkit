/**
 * AX 대시보드 — 클라이언트 사용량 패널 테스트
 *
 * db는 모킹하고, 다음 네 가지를 검증한다:
 * 1. 클라이언트별·모델별 집계가 맞는지
 * 2. Claude Code의 신규 한도 스냅샷과 기존 null 보고를 구분하는지
 * 3. isAdmin이 아닐 때 팀원별 상세(members)가 노출되지 않는지
 * 4. 여러 수집 구간이 섞여 있을 때 가장 최근 구간만 집계해 이중 계상을 막는지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn(), selectDistinctOn: vi.fn() },
  axClientUsage: { name: 'ax_client_usage', userId: 'user_id', periodStart: 'period_start' },
  axUsageCollectorState: { name: 'ax_usage_collector_state' },
  mcpAuditLogs: {
    userAgent: 'mcp_audit_logs.user_agent',
    accessTokenId: 'mcp_audit_logs.access_token_id',
    createdAt: 'mcp_audit_logs.created_at',
    clientName: 'mcp_audit_logs.client_name',
  },
  oauthAccessTokens: {
    id: 'oauth_access_tokens.id',
    userId: 'oauth_access_tokens.user_id',
    isActive: 'oauth_access_tokens.is_active',
    expiresAt: 'oauth_access_tokens.expires_at',
  },
  oauthRefreshTokens: {
    userId: 'oauth_refresh_tokens.user_id',
    isActive: 'oauth_refresh_tokens.is_active',
    expiresAt: 'oauth_refresh_tokens.expires_at',
  },
  users: {
    id: 'users.id',
    email: 'users.email',
    name: 'users.name',
    accountStatus: 'users.account_status',
    lastLoginAt: 'users.last_login_at',
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

// 구독 절은 각자 테스트가 있다. 여기서는 db.select 순서를 건드리지 않게 로더를 대체한다
const subscriptionMocks = vi.hoisted(() => ({
  subscriptions: vi.fn(),
  renewals: vi.fn(),
}))
vi.mock('../../../../packages/lib/src/features/ax/subscriptions', () => ({
  subscriptionsPanel: { load: subscriptionMocks.subscriptions },
}))
vi.mock('../../../../packages/lib/src/features/ax/subscription-renewals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../packages/lib/src/features/ax/subscription-renewals')>()),
  loadRenewalData: subscriptionMocks.renewals,
}))

const { clientUsagePanel } = await import('../../../../packages/lib/src/features/ax/usage')
const { db } = await import('@gpters/db')

/** 어떤 체이닝에도 자신을 돌려주고, await 하면 결과를 내는 쿼리 빌더 */
function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
    stub[method] = vi.fn(() => stub)
  }
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

function queueRows(rows: unknown[]) {
  vi.mocked(db.select).mockReset()
  vi.mocked(db.select).mockReturnValueOnce(builder(rows) as never)
}

const THIS_WEEK = new Date('2026-08-01T00:00:00Z')
const LAST_WEEK = new Date('2026-07-25T00:00:00Z')

const row = (overrides: Record<string, unknown> = {}) => ({
  userId: null,
  memberName: '진우',
  client: 'codex',
  planRaw: 'prolite',
  plan: 'ChatGPT Pro (lite)',
  periodStart: THIS_WEEK,
  periodEnd: new Date('2026-08-08T00:00:00Z'),
  inputTokens: 100,
  outputTokens: 50,
  cachedTokens: 850,
  sessions: 3,
  models: { 'gpt-5.6-sol': 1000 },
  limitUsedPercent: '34.00',
  limitResetsAt: new Date('2026-08-13T00:00:00Z'),
  syncedAt: new Date('2026-08-06T09:00:00Z'),
  ...overrides,
})

const ADMIN = { days: 30, isAdmin: true }
const MEMBER = { days: 30, isAdmin: false }

describe('clientUsagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscriptionMocks.subscriptions.mockResolvedValue({ status: 'not_configured', data: null })
    subscriptionMocks.renewals.mockResolvedValue(null)
    // 참여율 분모는 도메인이 설정된 경우에만 붙는다 — 기본 테스트는 분모 없이 돈다
    delete process.env.INTERNAL_ORGANIZATION_DOMAIN
    delete process.env.AX_USAGE_EXCLUDED_EMAILS
    // 최근성 컷오프가 실제 시계를 보므로 고정한다 — 아니면 달력이 지나며 테스트가 깨진다
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('수집 데이터가 없으면 오류가 아니라 not_configured로 응답한다', async () => {
    queueRows([])
    const result = await clientUsagePanel.load(ADMIN)

    expect(result.status).toBe('not_configured')
    expect(result.data).toBeNull()
  })

  it('클라이언트별로 토큰·세션·인원을 집계한다', async () => {
    queueRows([
      row({ memberName: '진우', client: 'codex' }),
      row({
        memberName: '다혜',
        client: 'codex',
        inputTokens: 200,
        outputTokens: 100,
        cachedTokens: 700,
        sessions: 2,
        limitUsedPercent: '50.00',
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)
    expect(result.status).toBe('ok')

    const codex = result.data!.byClient.find((c) => c.client === 'codex')!
    expect(codex.members).toBe(2)
    expect(codex.sessions).toBe(5)
    expect(codex.totalTokens).toBe(2000)
    // 주기 평균이 없으면 현재 스냅샷(34, 50)으로 대신하지 않는다
    expect(codex.reportsLimit).toBe(true)
    expect(codex.avgLimitUsedPercent).toBeNull()
  })

  describe('결제한 구독의 사용만 합계에 넣는다 (EDU-11817)', () => {
    const sub = (ownerName: string, vendor: string) => ({
      ownerName, vendor, plan: 'Pro5x', amount: 100, currency: 'USD', billingCycle: 'monthly',
      renewalDay: 1, payer: '본인', status: 'active', hasAccountKey: false,
    })
    const subscriptions = {
      status: 'ok',
      data: {
        syncedAt: null, activeSeats: 2, monthlyByCurrency: { USD: 200 },
        byVendor: [{ vendor: 'OpenAI', seats: 2, monthlyByCurrency: { USD: 200 } }],
        // 다혜는 공용 계정을 개인으로 쓴다 — 공용 구독에는 사람 보고를 붙이지 않는다
        members: [sub('진우', 'OpenAI'), sub('공용(다혜팀)', 'OpenAI')],
      },
    }
    const usage = () => [
      row({ memberName: '진우', client: 'codex', models: { 'gpt-5.6-sol': 1000 } }),
      row({ memberName: '다혜', client: 'codex', sessions: 2, models: { 'gpt-5.6-terra': 700 } }),
      row({ memberName: '진우', client: 'claude-code', models: { 'claude-opus-5-5': 900 } }),
    ]

    it.each([['관리자', ADMIN], ['구성원', MEMBER]])('%s 화면의 서비스·모델 합계에서 구독 없는 사용을 뺀다', async (_, ctx) => {
      subscriptionMocks.subscriptions.mockResolvedValue(subscriptions)
      queueRows(usage())
      const result = await clientUsagePanel.load(ctx)

      // 소유자 이름은 서버 안에서만 읽는다 — 구성원에게는 여전히 내보내지 않는다
      expect(subscriptionMocks.subscriptions).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }))
      expect(result.data!.subscriptions!.members).toEqual(ctx.isAdmin ? subscriptions.data.members : null)
      expect(result.data!.byClient).toEqual([
        expect.objectContaining({ client: 'codex', members: 1, sessions: 3, totalTokens: 1000 }),
      ])
      expect(result.data!.totalTokens).toBe(1000)
      expect(result.data!.byModel).toEqual([{ model: 'gpt-5.6-sol', tokens: 1000 }])
    })

    it('구성원 × 구독 표에는 구독 없는 줄도 넘겨 「구독 없이 사용」을 셀 수 있게 한다', async () => {
      subscriptionMocks.subscriptions.mockResolvedValue(subscriptions)
      queueRows(usage())
      const result = await clientUsagePanel.load(ADMIN)
      expect(result.data!.people!.filter((person) => !person.subscription).map((person) => `${person.name}/${person.service}`).sort())
        .toEqual(['다혜/Codex', '진우/Claude Code'])
    })

    it('공용 계정을 개인이 쓴 Codex 사용은 결제한 구독의 사용으로 세고, 「구독 없이 사용」에서도 뺀다', async () => {
      subscriptionMocks.subscriptions.mockResolvedValue(subscriptions)
      // 다혜 보고의 초기화 시각이 공용(다혜팀) 계정의 지금 회차와 3초 차이 — 같은 계정이다
      subscriptionMocks.renewals.mockResolvedValue({ rows: [], sharedCodexResets: ['2026-08-13T00:00:03.000Z'] })
      queueRows(usage())
      const result = await clientUsagePanel.load(ADMIN)

      expect(result.data!.byClient).toEqual([
        expect.objectContaining({ client: 'codex', members: 2, sessions: 5, totalTokens: 2000 }),
      ])
      expect(result.data!.people!.filter((person) => !person.subscription).map((person) => person.name)).toEqual(['진우'])
    })

    const sharedRenewal = (resetsAt: string) => ({ rows: [], sharedCodexResets: [resetsAt] })

    it('자기 구독이 있는 사람은 초기화 시각이 공용 계정과 겹쳐도 자기 구독으로 한 번만 센다', async () => {
      subscriptionMocks.subscriptions.mockResolvedValue(subscriptions)
      // 진우 Codex(초기화 08-13T00:00:00Z)가 공용 계정 회차와 1초 차이 — 일괄 초기화로 다른 계정이 몰린 경우
      subscriptionMocks.renewals.mockResolvedValue(sharedRenewal('2026-08-13T00:00:01.000Z'))
      queueRows([row({ memberName: '진우', client: 'codex' })])
      const result = await clientUsagePanel.load(ADMIN)
      expect(result.data!.byClient).toEqual([expect.objectContaining({ client: 'codex', members: 1, totalTokens: 1000 })])
      expect(result.data!.people!.find((person) => person.name === '진우' && person.service === 'Codex')!.subscription).not.toBeNull()
    })

    it('같은 이름의 보고 둘 중 공용 계정에 맞는 보고만 「구독 없이 사용」에서 뺀다', async () => {
      subscriptionMocks.subscriptions.mockResolvedValue(subscriptions)
      subscriptionMocks.renewals.mockResolvedValue(sharedRenewal('2026-08-13T00:00:03.000Z'))
      queueRows([
        row({ userId: 'u-1', memberName: '다혜', client: 'codex' }),
        row({ userId: 'u-2', memberName: '다혜', client: 'codex', limitResetsAt: new Date('2026-08-15T00:00:00Z') }),
      ])
      const result = await clientUsagePanel.load(ADMIN)
      expect(result.data!.people!.filter((person) => !person.subscription)).toHaveLength(1)
      expect(result.data!.byClient).toEqual([expect.objectContaining({ client: 'codex', members: 1, totalTokens: 1000 })])
    })

    it('구독을 못 읽으면 거르지 않는다', async () => {
      queueRows(usage())
      const result = await clientUsagePanel.load(ADMIN)
      expect(result.data!.totalTokens).toBe(3000)
    })
  })

  it('서비스별 주간 한도는 사람별 주기 평균의 평균이고, 관리자가 아니어도 집계값은 받는다', async () => {
    const renewal = (ownerName: string, vendor: string, averagePercent: number | null) => ({
      ownerName, vendor, plan: 'Max5x', amount: 100, currency: 'USD', renewalDay: 1,
      nextRenewal: '2026-09-01', daysLeft: 22, weeks: [], averagePercent,
      currentPercent: null, currentResetsAt: null, recentWeeks: [],
    })
    subscriptionMocks.renewals.mockResolvedValue({
      rows: [
        renewal('진우', 'OpenAI', 20),
        renewal('다혜', 'OpenAI', 50.5),
        renewal('하영', 'OpenAI', null),
        renewal('진우', 'Anthropic', 80),
        // 같은 사람의 같은 서비스 구독 둘(결제일이 달라 값도 다름)은 그 사람 안에서 먼저 평균한다 → 진우 70
        renewal('진우', 'Anthropic', 60),
        renewal('다혜', 'Anthropic', 40),
      ],
    })
    queueRows([row(), row({ client: 'claude-code', plan: 'Claude Max 5x', limitUsedPercent: '10.00' })])

    const result = await clientUsagePanel.load(MEMBER)
    const byClient = Object.fromEntries(result.data!.byClient.map((c) => [c.client, c.avgLimitUsedPercent]))
    // (20 + 50.5) / 2 — 주기 평균이 없는 구독은 빠진다. 현재 스냅샷(34·10)은 쓰지 않는다
    expect(byClient.codex).toBe(35.3)
    // (70 + 40) / 2 — 구독 셋을 그대로 평균하면 60이 된다
    expect(byClient['claude-code']).toBe(55)
    expect(result.data!.people).toBeNull()
  })

  it('기존 Claude 보고에 한도 스냅샷이 없으면 null로 남고 reportsLimit이 false다', async () => {
    queueRows([
      row({
        client: 'claude-code',
        plan: 'Claude Max 20x',
        limitUsedPercent: null,
        limitResetsAt: null,
        models: { 'claude-opus-5': 1000 },
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)
    const claude = result.data!.byClient.find((c) => c.client === 'claude-code')!

    expect(claude.reportsLimit).toBe(false)
    // 0이 아니라 null이어야 한다 — 0은 "한도를 안 썼다"로 읽힌다
    expect(claude.avgLimitUsedPercent).toBeNull()
    expect(claude.avgLimitUsedPercent).not.toBe(0)
    expect(result.data!.members![0].limitUsedPercent).toBeNull()
  })

  it('새 Claude 보고에 주간 한도가 있으면 사용률과 리셋 시각을 집계한다', async () => {
    queueRows([
      row({
        client: 'claude-code',
        plan: 'Claude Max 20x',
        limitUsedPercent: '63.00',
        limitResetsAt: new Date('2026-08-13T20:00:00Z'),
        models: { 'claude-opus-5': 1000 },
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)
    const claude = result.data!.byClient.find((c) => c.client === 'claude-code')!

    expect(claude.reportsLimit).toBe(true)
    expect(result.data!.members![0].limitResetsAt).toBe('2026-08-13T20:00:00.000Z')
  })

  it('관리자가 아니면 팀원별 상세를 내려주지 않는다', async () => {
    queueRows([row(), row({ memberName: '다혜' })])

    const result = await clientUsagePanel.load(MEMBER)

    expect(result.data!.members).toBeNull()
    // 집계는 전원에게 보인다
    expect(result.data!.byClient.length).toBeGreaterThan(0)
    expect(JSON.stringify(result.data)).not.toContain('진우')
  })

  it('같은 사람의 보고가 여러 건이면 최신 한 건만 집계해 이중 계상을 막는다', async () => {
    queueRows([
      row({ periodStart: THIS_WEEK, cachedTokens: 850 }),
      row({ memberName: '진우', periodStart: LAST_WEEK, cachedTokens: 9999 }),
    ])

    const result = await clientUsagePanel.load(ADMIN)

    // 지난주 행이 더해지면 안 된다
    expect(result.data!.totalTokens).toBe(1000)
    expect(result.data!.members).toHaveLength(1)
    expect(result.data!.periodStart).toBe(THIS_WEEK.toISOString())
  })

  it('보고일이 달라 구간이 어긋나도 두 사람 모두 집계된다', async () => {
    // 수집기는 실행일 기준 롤링 윈도우라 사람마다 periodStart가 다르다.
    // 전역 최신 구간으로 자르면 어제 보고한 사람이 통째로 사라진다.
    queueRows([
      row({ memberName: '진우', periodStart: THIS_WEEK, cachedTokens: 850 }),
      row({
        memberName: '다혜',
        periodStart: LAST_WEEK,
        periodEnd: new Date('2026-08-01T00:00:00Z'),
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 350,
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.reportingMembers).toBe(2)
    expect(result.data!.totalTokens).toBe(1500)
    expect(result.data!.members).toHaveLength(2)
    // 화면 구간은 포함된 보고 전체를 덮는 범위다
    expect(result.data!.periodStart).toBe(LAST_WEEK.toISOString())
    expect(result.data!.periodEnd).toBe('2026-08-08T00:00:00.000Z')
  })

  it('최근 창을 벗어난 보고만 있으면 not_configured로 응답한다', async () => {
    queueRows([
      row({
        periodStart: new Date('2026-06-01T00:00:00Z'),
        periodEnd: new Date('2026-06-08T00:00:00Z'),
        syncedAt: new Date('2026-06-08T09:00:00Z'),
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)

    // 두 달 전 숫자를 "현재 사용량"으로 보여주면 안 된다
    expect(result.status).toBe('not_configured')
    expect(result.data).toBeNull()
  })

  it('도메인이 없으면 참여율 분모 없이 보고 인원만 내려준다', async () => {
    queueRows([row(), row({ memberName: '다혜' })])

    const result = await clientUsagePanel.load(MEMBER)

    expect(result.data!.reportingMembers).toBe(2)
    // 분모를 추정해 채우면 안 된다 — 도메인 미설정이면 null
    expect(result.data!.internalMembers).toBeNull()
  })

  it('도메인이 설정되면 사내 계정 수를 참여율 분모로 내려준다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      .mockReturnValueOnce(builder([row(), row({ memberName: '다혜' })]) as never)
      .mockReturnValueOnce(
        builder(
          Array.from({ length: 12 }, (_, index) => ({
            id: `user-${index}`,
            email: `user-${index}@gpters.org`,
            name: `사용자 ${index}`,
            lastLoginAt: null,
          }))
        ) as never
      )

    const result = await clientUsagePanel.load(MEMBER)

    expect(result.data!.reportingMembers).toBe(2)
    expect(result.data!.internalMembers).toBe(12)
    // 주간 사용량과 현재 수집 참여 상태는 서로 다른 지표로 분리한다
    expect(result.highlights).toEqual([
      { label: '전체 구성원', value: '12', hint: '명' },
      { label: '주간 토큰 소비량', value: '2K', hint: 'tokens' },
      { label: '주간 활성', value: '2', hint: '명' },
    ])
  })

  it('공용 계정은 참여율 분모와 참여 상태 표에서 뺀다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'
    process.env.AX_USAGE_EXCLUDED_EMAILS = ' Support@gpters.org , '

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      .mockReturnValueOnce(builder([row({ userId: 'user-1' })]) as never)
      .mockReturnValueOnce(
        builder([
          { id: 'user-1', email: 'member01@gpters.org', name: '구성원', lastLoginAt: null },
          { id: 'shared', email: 'support@gpters.org', name: '공용', lastLoginAt: null },
        ]) as never
      )
      // collector heartbeat → access token → refresh token
      .mockReturnValueOnce(builder([]) as never)
      .mockReturnValueOnce(
        builder([{ userId: 'shared', isActive: true, expiresAt: new Date('2026-09-01T00:00:00Z') }]) as never
      )
      .mockReturnValueOnce(builder([]) as never)

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.internalMembers).toBe(1)
    expect(result.data!.participation!.map((item) => item.userId)).toEqual(['user-1'])
  })

  it('공용 계정의 사용량은 참여 상태 조회가 실패해도 활성 인원·토큰에 섞이지 않는다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'
    process.env.AX_USAGE_EXCLUDED_EMAILS = 'support@gpters.org'

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      .mockReturnValueOnce(builder([row({ userId: 'user-1' }), row({ userId: 'shared', memberName: '공용' })]) as never)
      .mockReturnValueOnce(
        builder([
          { id: 'user-1', email: 'member01@gpters.org', name: '구성원', lastLoginAt: null },
          { id: 'shared', email: 'support@gpters.org', name: '공용', lastLoginAt: null },
        ]) as never
      )
      // 참여 상태 조회 실패 → 활성 인원은 사용량 행으로 센다
      .mockImplementationOnce(() => {
        throw new Error('연결 끊김')
      })

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.internalMembers).toBe(1)
    expect(result.data!.reportingMembers).toBe(1)
    expect(result.data!.members!.map((item) => item.userId)).toEqual(['user-1'])
  })

  it('user_id가 연결된 상세 행은 수집 당시 별칭 대신 현재 계정 이름을 쓴다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      .mockReturnValueOnce(
        builder([row({ userId: 'user-1', memberName: 'member01' })]) as never
      )
      .mockReturnValueOnce(
        builder([
          {
            id: 'user-1',
            email: 'member01@gpters.org',
            name: '구성원 01',
            lastLoginAt: null,
          },
        ]) as never
      )
      // collector heartbeat → access token → refresh token
      .mockReturnValueOnce(builder([]) as never)
      .mockReturnValueOnce(builder([]) as never)
      .mockReturnValueOnce(builder([]) as never)

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.members![0].memberName).toBe('구성원 01')
  })

  it('분모 조회가 실패해도 패널은 정상 응답한다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      .mockReturnValueOnce(builder([row()]) as never)
      .mockImplementationOnce(() => {
        throw new Error('연결 끊김')
      })

    const result = await clientUsagePanel.load(MEMBER)

    expect(result.status).toBe('ok')
    expect(result.data!.internalMembers).toBeNull()
  })

  it('관리자는 전 계정을 다섯 가지 수집 참여 상태로 구분해 본다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'
    const internalUsers = [
      ['u-reporting', '정상'],
      ['u-unused', '미사용'],
      ['u-stale', '장기미보고'],
      ['u-uninstalled', '미설치'],
      ['u-unapproved', '미승인'],
      ['u-legacy', '레거시'],
    ].map(([id, name]) => ({
      id,
      name,
      email: `${id}@gpters.org`,
      lastLoginAt: new Date('2026-08-09T00:00:00Z'),
    }))

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      // 기존 사용량 → 내부 계정 → collector heartbeat → access token → refresh token
      .mockReturnValueOnce(builder([row({ memberName: '레거시' })]) as never)
      .mockReturnValueOnce(builder(internalUsers) as never)
      .mockReturnValueOnce(
        builder([
          {
            userId: 'u-reporting',
            memberName: '정상',
            clients: ['codex'],
            recordCount: 1,
            lastReportedAt: new Date('2026-08-09T00:00:00Z'),
          },
          {
            userId: 'u-unused',
            memberName: '미사용',
            clients: [],
            recordCount: 0,
            lastReportedAt: new Date('2026-08-09T00:00:00Z'),
          },
          {
            userId: 'u-stale',
            memberName: '장기미보고',
            clients: ['claude-code'],
            recordCount: 1,
            lastReportedAt: new Date('2026-07-01T00:00:00Z'),
          },
        ]) as never
      )
      .mockReturnValueOnce(
        builder([
          {
            userId: 'u-uninstalled',
            isActive: true,
            expiresAt: new Date('2026-09-01T00:00:00Z'),
          },
        ]) as never
      )
      .mockReturnValueOnce(builder([]) as never)

    vi.mocked(db.selectDistinctOn).mockReset()
    vi.mocked(db.selectDistinctOn).mockReturnValueOnce(
      builder([
        { userId: 'u-reporting', userAgent: 'aitk/0.7.24' },
        { userId: 'u-stale', userAgent: 'node', clientName: 'aitk CLI' },
        { userId: 'u-unused', userAgent: 'Mozilla/5.0' },
      ]) as never
    )

    const result = await clientUsagePanel.load(ADMIN)
    const byId = new Map(result.data!.participation!.map((item) => [item.userId, item]))

    // aitk 버전은 User-Agent에서 읽고, 형식이 다르거나 요청이 없으면 null이다.
    expect(byId.get('u-reporting')?.aitkVersion).toBe('0.7.24')
    // User-Agent를 붙이기 전(0.7.10 미만) aitk는 Node 기본값 `node`로 온다.
    expect(byId.get('u-stale')?.aitkVersion).toBe('0.7.9 이하')
    expect(byId.get('u-unused')?.aitkVersion).toBeNull()
    expect(byId.get('u-unapproved')?.aitkVersion).toBeNull()

    expect(byId.get('u-reporting')?.status).toBe('reporting')
    expect(byId.get('u-unused')?.status).toBe('not_using')
    expect(byId.get('u-stale')?.status).toBe('stale')
    expect(byId.get('u-uninstalled')?.status).toBe('not_installed')
    expect(byId.get('u-unapproved')?.status).toBe('not_approved')
    expect(byId.get('u-legacy')).toMatchObject({
      status: 'reporting',
      source: 'legacy_usage',
    })
    // 나쁜 상태부터 좋은 상태로 묶고, 같은 상태 안에서는 이름순이다.
    expect(result.data!.participation!.map((item) => `${item.status}:${item.memberName}`)).toEqual([
      'not_approved:미승인',
      'not_installed:미설치',
      'stale:장기미보고',
      'not_using:미사용',
      'reporting:레거시',
      'reporting:정상',
    ])
    // 사용량 0 heartbeat는 수집 정상 상태지만 실제 주간 활성에는 포함하지 않는다.
    expect(result.data!.reportingMembers).toBe(2)
    expect(result.highlights?.[2]).toEqual({
      label: '주간 활성',
      value: '2',
      hint: '명',
    })
  })

  it('aitk 버전 조회가 실패해도 참여 상태는 버전 없이 그대로 보여준다', async () => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select)
      .mockReturnValueOnce(builder([row({ userId: 'user-1' })]) as never)
      .mockReturnValueOnce(
        builder([{ id: 'user-1', email: 'member01@gpters.org', name: '구성원', lastLoginAt: null }]) as never
      )
      .mockReturnValueOnce(builder([]) as never)
      .mockReturnValueOnce(builder([]) as never)
      .mockReturnValueOnce(builder([]) as never)
    vi.mocked(db.selectDistinctOn).mockReset()
    vi.mocked(db.selectDistinctOn).mockImplementationOnce(() => {
      throw new Error('감사 로그 조회 실패')
    })

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.participation).toEqual([
      expect.objectContaining({ userId: 'user-1', status: 'reporting', aitkVersion: null }),
    ])
  })

  it('모델별 사용량을 내림차순으로 합산한다', async () => {
    queueRows([
      row({ models: { 'gpt-5.6-sol': 300, 'claude-opus-5': 100 } }),
      row({ memberName: '다혜', models: { 'claude-opus-5': 500 } }),
    ])

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.byModel).toEqual([
      { model: 'claude-opus-5', tokens: 600 },
      { model: 'gpt-5.6-sol', tokens: 300 },
    ])
  })

  it('조회 실패 시 오류 상태로 응답한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error('연결 끊김')
    })

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })
})

describe('clientUsagePanel — 구독 합치기', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.INTERNAL_ORGANIZATION_DOMAIN
    delete process.env.AX_USAGE_EXCLUDED_EMAILS
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const subscriptionData = (members: unknown[] | null) => ({
    status: 'ok',
    data: { syncedAt: null, activeSeats: 1, monthlyByCurrency: { USD: 100 }, byVendor: [], members },
    highlights: [{ label: '월 구독 비용', value: '$100' }],
  })

  it('관리자에게는 구독과 사용량을 사람 × 서비스로 합친 줄을 준다', async () => {
    queueRows([row({ memberName: '진우 (소파)', client: 'codex' })])
    subscriptionMocks.subscriptions.mockResolvedValue(subscriptionData([
      { ownerName: '진우', vendor: 'OpenAI', plan: 'Pro5x', amount: 100, currency: 'USD', billingCycle: 'monthly', renewalDay: 5, payer: '본인', status: 'active' },
    ]))
    subscriptionMocks.renewals.mockResolvedValue({ rows: [] })

    const result = await clientUsagePanel.load({ days: 7, isAdmin: true })

    expect(result.data?.people).toEqual([expect.objectContaining({
      name: '진우 (소파)',
      service: 'Codex',
      subscription: expect.objectContaining({ plan: 'Pro5x', nextRenewal: '2026-08-05', daysLeft: 2 }),
      usage: expect.objectContaining({ limitUsedPercent: 34 }),
    })])
    expect(result.highlights?.map((item) => item.label)).toContain('월 구독 비용')
  })

  it('관리자가 아니면 구성원 줄을 주지 않는다 — 갱신 데이터는 서비스별 집계에만 쓴다', async () => {
    queueRows([row()])
    subscriptionMocks.subscriptions.mockResolvedValue(subscriptionData(null))
    subscriptionMocks.renewals.mockResolvedValue(null)

    const result = await clientUsagePanel.load({ days: 7, isAdmin: false })

    expect(result.data?.people).toBeNull()
    expect(result.data?.subscriptions).not.toBeNull()
    expect(subscriptionMocks.renewals).toHaveBeenCalled()
    // 갱신 데이터를 못 읽으면 비관리자에게도 알린다 — 서비스 칸이 "회차 없음"이 아니라 조회 실패가 된다
    expect(result.data?.cycleError).toBe(true)
  })

  it('구독을 못 읽어도 사용량은 그대로 보여준다', async () => {
    queueRows([row()])
    subscriptionMocks.subscriptions.mockResolvedValue({ status: 'error', data: null })

    const result = await clientUsagePanel.load({ days: 7, isAdmin: true })

    expect(result.status).toBe('ok')
    expect(result.data?.subscriptions).toBeNull()
    expect(result.data?.byClient).toHaveLength(1)
    // 빈 구독으로 합치면 모두 "구독 없음"이 된다 — 표를 만들지 않고 실패를 알린다
    expect(result.data?.people).toBeNull()
    expect(result.data?.peopleError).toBe(true)
  })

  it('결제 주기 회차를 못 읽으면 "회차 없음"이 아니라 조회 실패로 표시하게 알린다', async () => {
    queueRows([row()])
    subscriptionMocks.subscriptions.mockResolvedValue(subscriptionData([]))
    subscriptionMocks.renewals.mockResolvedValue(null)

    const result = await clientUsagePanel.load({ days: 7, isAdmin: true })

    expect(result.data?.cycleError).toBe(true)
    expect(result.data?.peopleError).toBe(false)
  })
})
