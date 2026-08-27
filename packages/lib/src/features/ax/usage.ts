/**
 * AX Dashboard — 클라이언트 사용량 패널
 *
 * 각 팀원 머신의 수집기가 보낸 집계(`ax_client_usage`)를 읽어
 * 클라이언트별·모델별 사용량과 (관리자 전용) 팀원별 상세를 보여준다.
 *
 * 두 클라이언트는 주는 정보가 다르다 — Codex는 주간 한도 사용률을 직접 주고,
 * Claude Code는 그런 값을 로컬에 남기지 않아 토큰 총량만 있다.
 * 이 패널은 그 비대칭을 숨기지 않고 `reportsLimit`으로 드러낸다.
 */

import { db, axClientUsage, users } from '@gpters/db'
import { desc, ilike, sql } from 'drizzle-orm'
import type {
  AxPanel,
  AxPanelContext,
  AxPanelMeta,
  AxPanelResult,
  AxClientUsageClientRow,
  AxClientUsageData,
  AxClientUsageMemberRow,
  AxUsageClient,
} from './types'
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

/**
 * 클라이언트가 주간 한도 사용률을 보고하는지
 *
 * Claude Code는 `~/.claude` 어디에도 한도·쿼터를 남기지 않는다(2026-08 확인).
 * 그래서 이 패널은 Claude Code에 한해 한도 칸을 비우고, 그게 수집 실패가 아니라
 * 클라이언트의 특성임을 화면에 알린다.
 */
const CLIENT_REPORTS_LIMIT: Record<AxUsageClient, boolean> = {
  'claude-code': false,
  codex: true,
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
 * 이 기간(일)보다 오래된 보고는 "현재 사용량"으로 치지 않는다
 *
 * 수집기는 최근 7일 구간을 매일 보고한다. 마지막 보고가 2주를 넘겼다면
 * 그 사람의 숫자는 더 이상 현재를 말하지 않으므로 집계·참여율에서 뺀다.
 */
const RECENT_WINDOW_DAYS = 14

/**
 * 내부 도메인 계정 수 — 수집 참여율의 분모
 *
 * `INTERNAL_ORGANIZATION_DOMAIN`이 없으면 분모를 추정하지 않고 null을 돌려준다.
 * 조회에 실패해도 참여율 없이 패널은 정상 동작해야 하므로 오류를 삼키고 null을 준다.
 *
 * 분자(`memberName`)는 수집기가 보낸 표시명이고 분모는 계정 수라 완전히 같은
 * 모집단은 아니다 — 근사치임을 화면 문구가 밝힌다. `ax_client_usage`에는
 * 계정 식별자가 없어 지금은 이보다 정확하게 잇지 못한다.
 */
async function countInternalMembers(): Promise<number | null> {
  const domain = (process.env.INTERNAL_ORGANIZATION_DOMAIN || '').trim().toLowerCase()
  if (!domain) return null

  // LIKE 메타문자(_ 등)가 도메인에 있으면 접근 판정(endsWith)과 모집단이 어긋난다
  const escaped = domain.replace(/[\\%_]/g, (ch) => `\\${ch}`)

  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(ilike(users.email, `%@${escaped}`))
    const count = Number(row?.count)
    return Number.isFinite(count) ? count : null
  } catch (err) {
    log.warn('내부 도메인 계정 수 조회 실패 — 참여율 분모 없이 계속한다', { err })
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
    const rows = await db
      .select()
      .from(axClientUsage)
      .orderBy(desc(axClientUsage.periodStart))

    if (rows.length === 0) {
      return panelNotConfigured(
        meta,
        '아직 수집된 사용량이 없습니다. 팀원 머신에서 수집기를 한 번 실행하면 채워집니다'
      )
    }

    // 사람·클라이언트별 최신 보고만 남긴다 (rows는 periodStart 내림차순)
    const latestByMember = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      const key = `${row.memberName}|${row.client}`
      if (!latestByMember.has(key)) latestByMember.set(key, row)
    }

    // 오래된 보고는 현재 사용량이 아니다 — 최근 창 밖이면 뺀다
    const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const current = Array.from(latestByMember.values()).filter((row) => {
      const end = row.periodEnd instanceof Date ? row.periodEnd : new Date(row.periodEnd)
      return !Number.isNaN(end.getTime()) && end.getTime() >= cutoff
    })

    if (current.length === 0) {
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
      entry.members.add(row.memberName)
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
        reportsLimit: CLIENT_REPORTS_LIMIT[client] ?? false,
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

    const members: AxClientUsageMemberRow[] | null = ctx.isAdmin
      ? current
          .map((row) => ({
            memberName: row.memberName,
            client: row.client as AxUsageClient,
            plan: row.plan,
            totalTokens: row.inputTokens + row.outputTokens + row.cachedTokens,
            sessions: row.sessions,
            limitUsedPercent: toNumber(row.limitUsedPercent),
            limitResetsAt: toIso(row.limitResetsAt),
          }))
          .sort((a, b) => b.totalTokens - a.totalTokens)
      : null

    // 수집 시각은 사람마다 다르다. 가장 늦은 것을 기준으로 보여준다.
    const syncedAt = current.reduce<Date | null>((latest, row) => {
      const value = row.syncedAt instanceof Date ? row.syncedAt : new Date(row.syncedAt)
      if (Number.isNaN(value.getTime())) return latest
      return !latest || value > latest ? value : latest
    }, null)

    const memberCount = new Set(current.map((row) => row.memberName)).size

    // 사람마다 보고일이 달라 구간도 조금씩 다르다 — 화면에는 전체를 덮는 범위를 보여준다
    const periodStarts = current.map((row) => toIso(row.periodStart)).filter((v): v is string => v !== null)
    const periodEnds = current.map((row) => toIso(row.periodEnd)).filter((v): v is string => v !== null)
    const periodStart = periodStarts.length > 0 ? periodStarts.reduce((a, b) => (a < b ? a : b)) : null
    const periodEnd = periodEnds.length > 0 ? periodEnds.reduce((a, b) => (a > b ? a : b)) : null

    // 참여율 분모 — 보고 인원만 보이면 "다 참여 중"으로 오독된다
    const internalMembers = await countInternalMembers()

    return panelOk(
      meta,
      {
        syncedAt: syncedAt ? syncedAt.toISOString() : null,
        periodStart,
        periodEnd,
        reportingMembers: memberCount,
        internalMembers,
        totalTokens,
        byClient,
        byModel,
        members,
      },
      [
        {
          label: '토큰 사용',
          value: formatTokens(totalTokens),
          // 분모가 0이면 비율이 아니라 인원만 — 화면(PeriodNotice)과 같은 기준
          hint:
            internalMembers !== null && internalMembers > 0
              ? `${memberCount}/${internalMembers}명`
              : `${memberCount}명`,
        },
      ]
    )
  } catch (err) {
    log.error('클라이언트 사용량 조회 실패', err)
    return panelError(meta, '사용량 데이터를 불러오지 못했습니다')
  }
}

export const clientUsagePanel: AxPanel<AxClientUsageData> = { meta, load }
