/**
 * AX Dashboard — 클라이언트 사용량 패널
 *
 * 각 팀원 머신의 수집기가 보낸 집계(`ax_client_usage`)를 읽어
 * 클라이언트별·모델별 사용량과 (관리자 전용) 팀원별 상세를 보여준다.
 *
 * Codex는 롤아웃의 rate-limit 스냅샷을, Claude Code는 statusline usage cache의
 * 계정 주간 한도 스냅샷을 보고한다. 최신 스냅샷을 얻지 못한 행은 null로 남긴다.
 */

import {
  db,
  axClientUsage,
  axUsageCollectorState,
  oauthAccessTokens,
  oauthRefreshTokens,
  users,
} from '@gpters/db'
import { and, desc, eq, ilike } from 'drizzle-orm'
import type {
  AxPanel,
  AxPanelContext,
  AxPanelMeta,
  AxPanelResult,
  AxClientUsageClientRow,
  AxClientUsageData,
  AxClientUsageMemberRow,
  AxUsageParticipationRow,
  AxUsageClient,
} from './types'
import { AX_USAGE_PARTICIPATION_STATUS_ORDER } from './types'
import { panelOk, panelError, panelNotConfigured } from './panel'
import { createLogger } from '../../core/logger'

const log = createLogger('ax-usage')

const meta: AxPanelMeta = {
  id: 'client-usage',
  title: '클라이언트',
  description: '팀원별 AI 코딩 도구 사용량과 주간 한도 소진율',
  source: '각 팀원 로컬 수집기',
  visibility: 'org',
  usesPeriod: false,
}

/** 화면에 올릴 모델 수 상한 */
const MODEL_LIMIT = 8

/** numeric 컬럼은 드라이버가 문자열로 준다 */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** timestamp를 ISO 8601로. 드라이버가 string을 주는 경우도 함께 처리 */
function toIso(value: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 이 기간(일)보다 오래된 보고는 "주간 활성"으로 치지 않는다
 *
 * 수집기는 최근 7일 구간을 매일 보고한다. 토큰 집계와 보고 참여 상태의
 * 기준을 같은 7일로 맞춰, 한 카드의 "주간"이 서로 다른 기간을 뜻하지 않게 한다.
 */
const RECENT_WINDOW_DAYS = 7

/**
 * 내부 도메인 계정 목록 — 수집 참여율의 분모와 관리자 전수 상태의 모집단
 *
 * `INTERNAL_ORGANIZATION_DOMAIN`이 없으면 분모를 추정하지 않고 null을 돌려준다.
 * 조회에 실패해도 참여율 없이 패널은 정상 동작해야 하므로 오류를 삼키고 null을 준다.
 *
 * 신규 점검 신호는 userId로 정확히 연결된다. 전환 전 `ax_client_usage` 행만 표시명
 * 기반 보완 매칭을 쓰며, 동명이인이 있으면 연결하지 않는다.
 */
interface InternalMember {
  id: string
  email: string
  name: string | null
  lastLoginAt: Date | string | null
}

/** 마이그레이션 전후를 같은 형태로 읽는 클라이언트 사용량 행 */
type ClientUsageRow = typeof axClientUsage.$inferSelect

/**
 * user_id 마이그레이션 전 DB에서도 읽기 화면을 유지한다.
 * 신규 저장은 마이그레이션 이후 계약이므로 이 보완 경로는 조회에만 쓴다.
 */
async function loadUsageRows(): Promise<ClientUsageRow[]> {
  try {
    return await db.select().from(axClientUsage).orderBy(desc(axClientUsage.periodStart))
  } catch (err) {
    log.warn('사용량 user_id 조회 실패 — 마이그레이션 전 스키마로 읽는다', { err })
    const legacyRows = await db
      .select({
        id: axClientUsage.id,
        memberName: axClientUsage.memberName,
        client: axClientUsage.client,
        planRaw: axClientUsage.planRaw,
        plan: axClientUsage.plan,
        periodStart: axClientUsage.periodStart,
        periodEnd: axClientUsage.periodEnd,
        inputTokens: axClientUsage.inputTokens,
        outputTokens: axClientUsage.outputTokens,
        cachedTokens: axClientUsage.cachedTokens,
        sessions: axClientUsage.sessions,
        models: axClientUsage.models,
        limitUsedPercent: axClientUsage.limitUsedPercent,
        limitResetsAt: axClientUsage.limitResetsAt,
        syncedAt: axClientUsage.syncedAt,
        createdAt: axClientUsage.createdAt,
        updatedAt: axClientUsage.updatedAt,
      })
      .from(axClientUsage)
      .orderBy(desc(axClientUsage.periodStart))
    return legacyRows.map((row) => ({ ...row, userId: null }))
  }
}

async function loadInternalMembers(): Promise<InternalMember[] | null> {
  const domain = (process.env.INTERNAL_ORGANIZATION_DOMAIN || '').trim().toLowerCase()
  if (!domain) return null

  // LIKE 메타문자(_ 등)가 도메인에 있으면 접근 판정(endsWith)과 모집단이 어긋난다
  const escaped = domain.replace(/[\\%_]/g, (ch) => `\\${ch}`)

  try {
    try {
      return await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(
          and(
            ilike(users.email, `%@${escaped}`),
            eq(users.accountStatus, 'active')
          )
        )
    } catch (err) {
      log.warn('계정 상태 컬럼 조회 실패 — 마이그레이션 전 내부 계정 목록으로 읽는다', { err })
      return await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(ilike(users.email, `%@${escaped}`))
    }
  } catch (err) {
    log.warn('내부 도메인 계정 수 조회 실패 — 참여율 분모 없이 계속한다', { err })
    return null
  }
}

/** 표시명·이메일 로컬파트의 보완 매칭에 쓰는 정규형 */
function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('ko-KR')
}

/** OAuth access/refresh token이 지금 유효한지 */
function isActiveAuthorization(row: {
  isActive: boolean
  expiresAt: Date | string | null
}, now: number): boolean {
  if (!row.isActive) return false
  if (!row.expiresAt) return true
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now
}

/**
 * 관리자에게 보여줄 내부 계정 전원의 참여 상태를 만든다.
 *
 * 신규 수집기는 userId heartbeat로 정확히 연결한다. 배포 전 레코드는 사용자 ID가
 * 없으므로, 중복되지 않는 표시명/이메일 로컬파트에 한해 임시 보완 매칭한다.
 */
async function loadParticipation(
  internalMembers: InternalMember[],
  latestUsage: Array<(typeof axClientUsage.$inferSelect)>,
  cutoff: number
): Promise<AxUsageParticipationRow[] | null> {
  try {
    const [collectorRows, accessRows, refreshRows] = await Promise.all([
      // 롤링 배포 중에는 웹 코드가 마이그레이션보다 먼저 뜰 수 있다. 신규 테이블만
      // 없을 때는 기존 사용량·승인 근거로 상태 표를 계속 보여준다.
      (async () => {
        try {
          return await db.select().from(axUsageCollectorState)
        } catch (err) {
          log.warn('수집기 점검 테이블 조회 실패 — 기존 근거로 참여 상태를 계산한다', { err })
          return []
        }
      })(),
      db
        .select({
          userId: oauthAccessTokens.userId,
          isActive: oauthAccessTokens.isActive,
          expiresAt: oauthAccessTokens.expiresAt,
        })
        .from(oauthAccessTokens),
      db
        .select({
          userId: oauthRefreshTokens.userId,
          isActive: oauthRefreshTokens.isActive,
          expiresAt: oauthRefreshTokens.expiresAt,
        })
        .from(oauthRefreshTokens),
    ])

    const now = Date.now()
    const authorized = new Set<string>()
    for (const row of [...accessRows, ...refreshRows]) {
      if (isActiveAuthorization(row, now)) authorized.add(row.userId)
    }

    const collectorByUser = new Map(collectorRows.map((row) => [row.userId, row]))

    // userId가 있는 사용량은 직접 연결하고, 구형 행만 표시명으로 보완한다.
    const identityOwners = new Map<string, string[]>()
    for (const member of internalMembers) {
      const keys = new Set([
        normalizeIdentity(member.name),
        normalizeIdentity(member.email.split('@')[0]),
      ])
      for (const key of keys) {
        if (!key) continue
        identityOwners.set(key, [...(identityOwners.get(key) ?? []), member.id])
      }
    }

    const usageByUser = new Map<
      string,
      { lastReportedAt: string; clients: Set<AxUsageClient>; source: 'usage_report' | 'legacy_usage' }
    >()
    for (const usage of latestUsage) {
      const owners = usage.userId
        ? [usage.userId]
        : identityOwners.get(normalizeIdentity(usage.memberName)) ?? []
      if (owners.length !== 1) continue
      const reportedAt = toIso(usage.syncedAt)
      if (!reportedAt) continue
      const current = usageByUser.get(owners[0]) ?? {
        lastReportedAt: reportedAt,
        clients: new Set<AxUsageClient>(),
        source: usage.userId ? 'usage_report' as const : 'legacy_usage' as const,
      }
      if (reportedAt > current.lastReportedAt) current.lastReportedAt = reportedAt
      current.clients.add(usage.client as AxUsageClient)
      if (usage.userId) current.source = 'usage_report'
      usageByUser.set(owners[0], current)
    }

    return internalMembers
      .map((member): AxUsageParticipationRow => {
        const collector = collectorByUser.get(member.id)
        if (collector) {
          const lastReportedAt = toIso(collector.lastReportedAt)
          const recent = lastReportedAt !== null && new Date(lastReportedAt).getTime() >= cutoff
          return {
            userId: member.id,
            memberName: member.name?.trim() || member.email.split('@')[0],
            status: !recent ? 'stale' : collector.recordCount === 0 ? 'not_using' : 'reporting',
            lastReportedAt,
            lastLoginAt: toIso(member.lastLoginAt),
            clients: collector.clients,
            source: 'collector',
          }
        }

        const usage = usageByUser.get(member.id)
        if (usage) {
          const recent = new Date(usage.lastReportedAt).getTime() >= cutoff
          return {
            userId: member.id,
            memberName: member.name?.trim() || member.email.split('@')[0],
            status: recent ? 'reporting' : 'stale',
            lastReportedAt: usage.lastReportedAt,
            lastLoginAt: toIso(member.lastLoginAt),
            clients: Array.from(usage.clients),
            source: usage.source,
          }
        }

        return {
          userId: member.id,
          memberName: member.name?.trim() || member.email.split('@')[0],
          status: authorized.has(member.id) ? 'not_installed' : 'not_approved',
          lastReportedAt: null,
          lastLoginAt: toIso(member.lastLoginAt),
          clients: [],
          source: authorized.has(member.id) ? 'authorization' : 'none',
        }
      })
      // 챙겨야 할 계정이 먼저 보이도록 나쁜 상태부터, 같은 상태 안에서는 이름순.
      .sort(
        (a, b) =>
          AX_USAGE_PARTICIPATION_STATUS_ORDER.indexOf(a.status) -
            AX_USAGE_PARTICIPATION_STATUS_ORDER.indexOf(b.status) ||
          a.memberName.localeCompare(b.memberName, 'ko')
      )
  } catch (err) {
    log.warn('사용량 수집 참여 상태 조회 실패 — 사용량 집계만 계속한다', { err })
    return null
  }
}

/** 큰 수를 사람이 읽는 형태로 (요약 밴드용) */
function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/**
 * 클라이언트 사용량 패널 로드
 *
 * 사람·클라이언트별로 **가장 최근 보고 한 건만** 집계한다.
 *
 * 수집기의 구간은 실행일 기준 롤링 윈도우라, 사람마다 보고한 날이 다르면
 * periodStart도 다르다. "전역 최신 구간"으로 자르면 오늘 보고한 사람만 남고
 * 어제 보고한 사람은 통째로 사라진다. 같은 사람의 여러 보고를 더하지 않는 것만
 * 지키면 이중 계상은 없다.
 */
async function load(ctx: AxPanelContext): Promise<AxPanelResult<AxClientUsageData>> {
  try {
    const [rows, internalMemberRows] = await Promise.all([
      loadUsageRows(),
      loadInternalMembers(),
    ])

    if (rows.length === 0 && internalMemberRows === null) {
      return panelNotConfigured(
        meta,
        '아직 수집된 사용량이 없습니다. 팀원 머신에서 수집기를 한 번 실행하면 채워집니다'
      )
    }

    // 사람·클라이언트별 최신 보고만 남긴다 (rows는 periodStart 내림차순)
    const latestByMember = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      const identity = row.userId ?? `legacy:${normalizeIdentity(row.memberName)}`
      const key = `${identity}|${row.client}`
      if (!latestByMember.has(key)) latestByMember.set(key, row)
    }

    // 오래된 보고는 현재 사용량이 아니다 — 실제 서버 보고 시각을 기준으로 자른다.
    const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const current = Array.from(latestByMember.values()).filter((row) => {
      const reportedAt = row.syncedAt instanceof Date ? row.syncedAt : new Date(row.syncedAt)
      return !Number.isNaN(reportedAt.getTime()) && reportedAt.getTime() >= cutoff
    })

    if (current.length === 0 && internalMemberRows === null) {
      return panelNotConfigured(
        meta,
        `최근 ${RECENT_WINDOW_DAYS}일 안에 수집된 사용량이 없습니다. 팀원 머신에서 수집기를 실행하면 채워집니다`
      )
    }

    const clientAgg = new Map<
      AxUsageClient,
      { members: Set<string>; tokens: number; sessions: number; limits: number[] }
    >()
    const modelAgg = new Map<string, number>()
    let totalTokens = 0

    for (const row of current) {
      const client = row.client as AxUsageClient
      const tokens = row.inputTokens + row.outputTokens + row.cachedTokens
      totalTokens += tokens

      const entry = clientAgg.get(client) ?? {
        members: new Set<string>(),
        tokens: 0,
        sessions: 0,
        limits: [],
      }
      entry.members.add(row.userId ?? `legacy:${normalizeIdentity(row.memberName)}`)
      entry.tokens += tokens
      entry.sessions += row.sessions
      const pct = toNumber(row.limitUsedPercent)
      if (pct !== null) entry.limits.push(pct)
      clientAgg.set(client, entry)

      for (const [model, count] of Object.entries(row.models ?? {})) {
        if (typeof count !== 'number' || count <= 0) continue
        modelAgg.set(model, (modelAgg.get(model) ?? 0) + count)
      }
    }

    const byClient: AxClientUsageClientRow[] = Array.from(clientAgg.entries())
      .map(([client, agg]) => ({
        client,
        members: agg.members.size,
        totalTokens: agg.tokens,
        sessions: agg.sessions,
        reportsLimit: agg.limits.length > 0,
        avgLimitUsedPercent:
          agg.limits.length > 0
            ? Math.round((agg.limits.reduce((a, b) => a + b, 0) / agg.limits.length) * 10) / 10
            : null,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)

    const byModel = Array.from(modelAgg.entries())
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, MODEL_LIMIT)

    const internalMemberNameById = new Map(
      (internalMemberRows ?? []).map((member) => [
        member.id,
        member.name?.trim() || member.email.split('@')[0],
      ])
    )

    const members: AxClientUsageMemberRow[] | null = ctx.isAdmin
      ? current
          .map((row) => ({
            userId: row.userId,
            // user_id가 연결된 신규 행은 수집 당시 별칭이 아니라 현재 계정 표시명을 쓴다.
            // 이름 변경·이메일 로컬파트 백필 뒤에도 한 사람이 서로 다른 이름으로 보이지 않는다.
            memberName: row.userId
              ? internalMemberNameById.get(row.userId) ?? row.memberName
              : row.memberName,
            client: row.client as AxUsageClient,
            plan: row.plan,
            totalTokens: row.inputTokens + row.outputTokens + row.cachedTokens,
            sessions: row.sessions,
            limitUsedPercent: toNumber(row.limitUsedPercent),
            limitResetsAt: toIso(row.limitResetsAt),
            lastReportedAt: toIso(row.syncedAt),
          }))
          .sort((a, b) => b.totalTokens - a.totalTokens)
      : null

    // 수집 시각은 사람마다 다르다. 가장 늦은 것을 기준으로 보여준다.
    const syncedAt = current.reduce<Date | null>((latest, row) => {
      const value = row.syncedAt instanceof Date ? row.syncedAt : new Date(row.syncedAt)
      if (Number.isNaN(value.getTime())) return latest
      return !latest || value > latest ? value : latest
    }, null)

    const usageMemberCount = new Set(
      current.map((row) => row.userId ?? `legacy:${normalizeIdentity(row.memberName)}`)
    ).size

    // 사람마다 보고일이 달라 구간도 조금씩 다르다 — 화면에는 전체를 덮는 범위를 보여준다
    const periodStarts = current.map((row) => toIso(row.periodStart)).filter((v): v is string => v !== null)
    const periodEnds = current.map((row) => toIso(row.periodEnd)).filter((v): v is string => v !== null)
    const periodStart = periodStarts.length > 0 ? periodStarts.reduce((a, b) => (a < b ? a : b)) : null
    const periodEnd = periodEnds.length > 0 ? periodEnds.reduce((a, b) => (a > b ? a : b)) : null

    // 참여율 분모와 관리자 전용 전수 상태. 분모가 없으면 꾸며내지 않는다.
    const internalMembers = internalMemberRows?.length ?? null
    const participationRows =
      internalMemberRows !== null
        ? await loadParticipation(internalMemberRows, Array.from(latestByMember.values()), cutoff)
        : null
    // 주간 활성은 실제 사용 기록이 있는 사람만 센다. record_count=0 heartbeat는
    // 수집기가 정상이라는 별도 상태이지, 그 구성원이 주간에 사용했다는 뜻은 아니다.
    const activeReporterCount =
      participationRows !== null
        ? participationRows.filter((row) => row.status === 'reporting').length
        : usageMemberCount
    const participation = ctx.isAdmin ? participationRows : null

    return panelOk(
      meta,
      {
        syncedAt: syncedAt ? syncedAt.toISOString() : null,
        periodStart,
        periodEnd,
        reportingMembers: activeReporterCount,
        internalMembers,
        totalTokens,
        byClient,
        byModel,
        members,
        participation,
      },
      [
        ...(internalMembers !== null
          ? [
              {
                label: '전체 구성원',
                value: internalMembers.toLocaleString('ko-KR'),
                hint: '명',
              },
            ]
          : []),
        {
          label: '주간 토큰 소비량',
          value: formatTokens(totalTokens),
          hint: 'tokens',
        },
        {
          label: '주간 활성',
          value: activeReporterCount.toLocaleString('ko-KR'),
          hint: '명',
        },
      ]
    )
  } catch (err) {
    log.error('클라이언트 사용량 조회 실패', err)
    return panelError(meta, '사용량 데이터를 불러오지 못했습니다')
  }
}

export const clientUsagePanel: AxPanel<AxClientUsageData> = { meta, load }
