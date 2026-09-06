/**
 * 스킬 이벤트의 자유 텍스트 보관 기한 적용.
 *
 * `skill_events`에는 사람과 에이전트가 쓴 자유 문장이 두 컬럼에 쌓인다 —
 * `query`(검색어 원문)와 `context`(스킵 사유 · 적용 결과 요약. `report_skill_outcome.summary`도
 * 별도 컬럼이 아니라 여기 들어온다). 2026-09-06 표본에서 내부 시스템 인증 구조 분석이나
 * 채용 평가 기준 같은 업무 내용이 실제로 들어오는 것을 확인했다.
 *
 * 2026-09-06 결정: **계속 받되 90일이 지나면 원문을 지운다.** 열람은 관리자 전용 패널로 유지한다
 * (원문을 화면에 내보내는 곳은 `journey-insights` 하나뿐이고 이미 `visibility: 'admin'`이다).
 *
 * ## `auto:` 표식은 남긴다
 *
 * `context`를 통째로 비우면 안 된다. 맨 앞의 `auto:` 접두가 **자동 스킵과 사람이 쓴 스킵을 가르는
 * 기능**이라(`skill-opportunities`·`journey-insights`가 `NOT LIKE 'auto:%'`로 판정한다),
 * 원문을 지우더라도 그 표식은 보존해야 지표가 조용히 틀어지지 않는다.
 *
 * 지운 뒤에도 판정이 유지되는지:
 * - `auto:...` → `auto:` — 여전히 자동으로 분류된다
 * - 사람이 쓴 문장 → NULL — `COALESCE(context,'')`가 빈 문자열이라 여전히 자동이 아니다
 */

import { db, skillEvents } from '@gpters/db'
import { and, isNotNull, lt, ne, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('skill-text-retention')

/** 원문을 보관하는 기간(일). `mcp_sessions` 정리와 같은 값이다. */
export const SKILL_TEXT_RETENTION_DAYS = 90

/** 자동 스킵을 가리키는 접두. 원문을 지워도 이 표식만은 남긴다. */
export const AUTO_CONTEXT_MARKER = 'auto:'

/** 보관 기한 적용 결과 */
export interface SkillTextRedactionResult {
  /** 이 시각보다 오래된 행이 대상이다 (ISO 8601) */
  cutoff: string
  /** 지운(또는 지울) 검색어 원문 수 */
  queries: number
  /** 지운(또는 지울) 사람이 쓴 사유 수 */
  contexts: number
  /** `auto:` 표식만 남기고 줄인(또는 줄일) 자동 스킵 사유 수 */
  autoMarkers: number
  /** true면 세지기만 하고 아무것도 바꾸지 않았다 */
  dryRun: boolean
}

/**
 * 보관 기한이 지난 자유 텍스트를 지운다.
 *
 * @param options.retentionDays - 보관 기간(일). 기본 90
 * @param options.dryRun - true면 대상 건수만 세고 바꾸지 않는다
 * @returns 대상(또는 처리) 건수
 */
export async function redactOldSkillText(
  options: { retentionDays?: number; dryRun?: boolean } = {}
): Promise<SkillTextRedactionResult> {
  const retentionDays = options.retentionDays ?? SKILL_TEXT_RETENTION_DAYS
  const dryRun = options.dryRun ?? false
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const expired = lt(skillEvents.createdAt, cutoff)
  const isAuto = sql`${skillEvents.context} LIKE ${`${AUTO_CONTEXT_MARKER}%`}`
  const notAuto = sql`${skillEvents.context} NOT LIKE ${`${AUTO_CONTEXT_MARKER}%`}`

  if (dryRun) {
    const [counts] = await db
      .select({
        queries: sql<number>`count(*) filter (where ${skillEvents.query} is not null)::int`,
        contexts: sql<number>`count(*) filter (where ${skillEvents.context} is not null and ${notAuto})::int`,
        autoMarkers: sql<number>`count(*) filter (where ${isAuto} and ${skillEvents.context} <> ${AUTO_CONTEXT_MARKER})::int`,
      })
      .from(skillEvents)
      .where(expired)
    return {
      cutoff: cutoff.toISOString(),
      queries: Number(counts?.queries ?? 0),
      contexts: Number(counts?.contexts ?? 0),
      autoMarkers: Number(counts?.autoMarkers ?? 0),
      dryRun: true,
    }
  }

  const rowCount = (result: unknown): number =>
    Number((result as { rowCount?: number } | null)?.rowCount ?? 0)

  const queries = rowCount(
    await db.update(skillEvents).set({ query: null }).where(and(expired, isNotNull(skillEvents.query)))
  )
  // 자동 스킵은 표식만 남기고 줄인다. 순서가 중요하다 — 먼저 줄여야 아래 조건과 겹치지 않는다.
  const autoMarkers = rowCount(
    await db
      .update(skillEvents)
      .set({ context: AUTO_CONTEXT_MARKER })
      .where(and(expired, isAuto, ne(skillEvents.context, AUTO_CONTEXT_MARKER)))
  )
  const contexts = rowCount(
    await db
      .update(skillEvents)
      .set({ context: null })
      .where(and(expired, isNotNull(skillEvents.context), notAuto))
  )

  log.info('Redacted expired skill event free text', {
    retentionDays,
    cutoff: cutoff.toISOString(),
    queries,
    contexts,
    autoMarkers,
  })

  return { cutoff: cutoff.toISOString(), queries, contexts, autoMarkers, dryRun: false }
}
