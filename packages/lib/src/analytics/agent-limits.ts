/**
 * 봇 수집기가 보내는 구독 계정 주간 한도 스냅샷 (EDU-11519)
 *
 * 주간 한도는 봇이 아니라 계정에 걸린다 — 한 계정을 여러 봇이 쓰고(cswap), 한 봇이 계정을 돌려 쓴다.
 * 그래서 (클라이언트, 계정 키, 초기화 시각) 회차마다 최댓값만 올리고, 보고한 봇은 `agentIds` 에 모은다.
 * 계정 키는 수집기가 계정 이메일을 소문자·trim 해 sha256 한 값이다. 원문 이메일은 받지 않는다.
 * 회차 규칙(초기화 뒤 재보고 무시, 마지막 보고 시각은 최댓값을 다시 본 보고에서만)은 사람 쪽
 * `ax_usage_limit_windows` 와 같다.
 */

import { axAccountLimitWindows, db } from '@gpters/db'
import { sql } from 'drizzle-orm'

/** 한도 스냅샷이 나타내는 클라이언트 */
export type AgentLimitClient = 'claude-code' | 'codex'

/** 검증을 통과한 한도 스냅샷 */
export interface AgentLimitSnapshot {
  agentId: string
  collectorInstanceId: string
  client: AgentLimitClient
  /** 계정 이메일 sha256 hex (64자) */
  accountKey: string
  /** 0~100 */
  usedPercent: number
  resetsAt: string
  /** 수집기가 이 값을 관측한 시각 */
  observedAt: string
}

/** 수집 출처가 내보낼 수 있는 클라이언트 — OpenClaw 봇은 Claude Code CLI 로 돈다 */
const CLIENT_BY_SOURCE: Record<string, AgentLimitClient> = {
  'claude-code': 'claude-code',
  openclaw: 'claude-code',
  codex: 'codex',
}

/**
 * 출처에서 보낼 수 있는 클라이언트를 고른다. Hermes 등 아직 측정하지 않는 출처는 null
 *
 * @param source - 수집기 등록 출처
 */
export function agentLimitClientForSource(source: string): AgentLimitClient | null {
  return CLIENT_BY_SOURCE[source] ?? null
}

/**
 * 한도 스냅샷 본문을 검증한다
 *
 * @param input - 요청 본문
 * @param now - 서버 시각. 미래 관측과 이미 지난 회차를 가른다
 * @returns 통과하면 data, 아니면 이유 목록
 */
export function validateAgentLimitSnapshot(
  input: unknown,
  now = new Date()
): { ok: true; data: AgentLimitSnapshot } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['body must be an object'] }
  const body = input as Record<string, unknown>
  const errors: string[] = []
  const text = (key: string) => (typeof body[key] === 'string' ? body[key] as string : '')
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(text('agentId'))) errors.push('agentId is invalid')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(text('collectorInstanceId'))) errors.push('collectorInstanceId is invalid')
  if (text('client') !== 'claude-code' && text('client') !== 'codex') errors.push('client must be claude-code or codex')
  if (!/^[a-f0-9]{64}$/.test(text('accountKey'))) errors.push('accountKey must be a sha256 hex digest')
  const percent = body.usedPercent
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    errors.push('usedPercent must be a number between 0 and 100')
  }
  const resetsAt = Date.parse(text('resetsAt'))
  const observedAt = Date.parse(text('observedAt'))
  if (!Number.isFinite(resetsAt)) errors.push('resetsAt must be an ISO timestamp')
  if (!Number.isFinite(observedAt)) errors.push('observedAt must be an ISO timestamp')
  // 시계 오차는 5분까지 봐준다
  if (Number.isFinite(observedAt) && observedAt > now.getTime() + 5 * 60_000) errors.push('observedAt cannot be in the future')
  if (Number.isFinite(observedAt) && Number.isFinite(resetsAt) && resetsAt <= observedAt) {
    errors.push('resetsAt must be after observedAt')
  }
  // 주간 회차라 초기화는 관측 뒤 7일(+여유 하루) 안에 온다
  if (Number.isFinite(observedAt) && Number.isFinite(resetsAt) && resetsAt > observedAt + 8 * 86_400_000) {
    errors.push('resetsAt must be within 8 days of observedAt')
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    data: {
      agentId: text('agentId'),
      collectorInstanceId: text('collectorInstanceId'),
      client: text('client') as AgentLimitClient,
      accountKey: text('accountKey'),
      usedPercent: percent as number,
      resetsAt: new Date(resetsAt).toISOString(),
      observedAt: new Date(observedAt).toISOString(),
    },
  }
}

/**
 * 스냅샷을 계정 회차에 반영한다
 *
 * 관측 시각이 초기화 시각 이후면 지난 회차를 다시 보낸 것이라 넣지 않는다(검증이 막는다).
 * 서버가 받은 시각이 아니라 관측 시각을 쓰는 이유: Codex 한도는 rollout 의 마지막 기록이라 몇 시간 전 값일 수 있다.
 *
 * @param snapshot - 검증된 스냅샷
 * @returns 회차가 지나 반영하지 않았으면 false
 */
export async function recordAgentLimitSnapshot(snapshot: AgentLimitSnapshot, now = new Date()): Promise<boolean> {
  const resetsAt = new Date(snapshot.resetsAt)
  if (!(resetsAt > now)) return false
  const observedAt = new Date(snapshot.observedAt)
  const at = observedAt.toISOString()
  const value = snapshot.usedPercent.toFixed(2)
  await db
    .insert(axAccountLimitWindows)
    .values({
      client: snapshot.client,
      accountKey: snapshot.accountKey,
      resetsAt,
      maxUsedPercent: value,
      firstUsedPercent: value,
      firstReportedAt: observedAt,
      lastReportedAt: observedAt,
      lastSeenAt: observedAt,
      agentIds: [snapshot.agentId],
    })
    .onConflictDoUpdate({
      target: [axAccountLimitWindows.client, axAccountLimitWindows.accountKey, axAccountLimitWindows.resetsAt],
      set: {
        maxUsedPercent: sql`greatest(${axAccountLimitWindows.maxUsedPercent}, ${value}::numeric)`,
        lastReportedAt: sql`case
          when ${value}::numeric > ${axAccountLimitWindows.maxUsedPercent} then ${at}::timestamptz
          when ${value}::numeric = ${axAccountLimitWindows.maxUsedPercent} then greatest(${axAccountLimitWindows.lastReportedAt}, ${at}::timestamptz)
          else ${axAccountLimitWindows.lastReportedAt} end`,
        lastSeenAt: sql`greatest(${axAccountLimitWindows.lastSeenAt}, ${at}::timestamptz)`,
        // 관측 시각이 지금 기록된 첫 관측보다 이르면(봇 여럿이 늦게 보냄) 첫 관측 값도 그 값으로. 0048 전 행(null)은 첫 값을 모르니 그대로 둔다
        firstUsedPercent: sql`case when ${at}::timestamptz < ${axAccountLimitWindows.firstReportedAt} and ${axAccountLimitWindows.firstUsedPercent} is not null then ${value}::numeric else ${axAccountLimitWindows.firstUsedPercent} end`,
        firstReportedAt: sql`least(${axAccountLimitWindows.firstReportedAt}, ${at}::timestamptz)`,
        agentIds: sql`array(select distinct id from unnest(${axAccountLimitWindows.agentIds} || array[${snapshot.agentId}]::text[]) as id order by id)`,
      },
    })
  return true
}
