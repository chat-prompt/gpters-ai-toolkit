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

import { db, axClientUsage } from '@gpters/db'
import { desc } from 'drizzle-orm'
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
  title: '클라이언트 사용량',
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
 * 가장 최근 수집 구간 하나만 본다 — 구간이 섞이면 같은 사람의 토큰이
 * 여러 번 더해져 총량이 부풀려진다.
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

    // 가장 최근 구간만 집계한다. 구간이 다른 행을 함께 더하면 이중 계상된다.
    const latestStart = rows[0].periodStart
    const latestKey = toIso(latestStart)
    const current = rows.filter((row) => toIso(row.periodStart) === latestKey)

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

    return panelOk(
      meta,
      {
        syncedAt: syncedAt ? syncedAt.toISOString() : null,
        periodStart: latestKey,
        periodEnd: toIso(current[0].periodEnd),
        totalTokens,
        byClient,
        byModel,
        members,
      },
      [
        { label: '토큰 사용', value: formatTokens(totalTokens), hint: `${memberCount}명` },
      ]
    )
  } catch (err) {
    log.error('클라이언트 사용량 조회 실패', err)
    return panelError(meta, '사용량 데이터를 불러오지 못했습니다')
  }
}

export const clientUsagePanel: AxPanel<AxClientUsageData> = { meta, load }
