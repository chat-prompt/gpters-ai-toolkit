import { db, axIncidentReviews } from '@gpters/db'
import { and, eq } from 'drizzle-orm'
import { agentActivityPanel } from './agent-activity'
import { applyIncidentAction, incidentStats, projectIncidentCases } from './incident-review'
import type { IncidentAction, IncidentCase, IncidentInput, IncidentReviewData } from './incident-review'
import { panelError, panelNotConfigured, panelOk } from './panel'
import type { AxPanel, AxPanelMeta } from './types'

const meta: AxPanelMeta = { id: 'agent-incidents', title: '문제 검토', description: '실패 후보를 검토하고 수정·재검증 근거를 남깁니다', source: '관측된 작업 이벤트 · 관리자 검토 기록', visibility: 'admin', parentId: 'skill-usage', usesPeriod: true }

async function readInput(days: number): Promise<IncidentInput | null> {
  const end = new Date().toISOString()
  const result = await agentActivityPanel.load({ days, isAdmin: true })
  if (result.status === 'error') throw new Error('작업 이벤트 조회에 실패했습니다')
  if (!result.data || !result.data.taskTraces) return null
  return { traces: result.data.taskTraces, coverage: result.data.taskTraceCoverage,
    start: new Date(Date.parse(end) - days * 86400000).toISOString(), end }
}
function emptyInput(days: number): IncidentInput {
  const end = new Date().toISOString()
  return { traces: [], coverage: undefined, start: new Date(Date.parse(end) - days * 86400000).toISOString(), end }
}
export async function readIncidentReview(days: number): Promise<IncidentReviewData> {
  const [input, rows] = await Promise.all([readInput(days), db.select().from(axIncidentReviews)])
  const snapshot = input ?? emptyInput(days)
  const cases = projectIncidentCases(snapshot, rows.map(row => row.record as unknown as IncidentCase))
  const evaluations = Object.fromEntries(cases.filter(c => c.change).map(c => [c.id, incidentStats(c, snapshot, c.change!.appliedAt)]))
  return { cases, evaluations, start: snapshot.start, end: snapshot.end, sourceAvailable: !!input,
    truncated: !snapshot.coverage || snapshot.coverage.truncatedStreams.length > 0, storageReady: true }
}

export class IncidentConflict extends Error {}
export class IncidentValidationError extends Error {}

export async function saveIncidentReview(action: IncidentAction, actor: string): Promise<IncidentCase> {
  const [input, rows] = await Promise.all([readInput(action.days), db.select().from(axIncidentReviews).where(eq(axIncidentReviews.id, action.id))])
  // Never let a request manufacture a candidate or supply its own evidence/counters.
  if (!input) throw new IncidentValidationError('원천 작업 이벤트를 조회한 뒤 다시 시도하세요')
  const current = projectIncidentCases(input, rows.map(row => row.record as unknown as IncidentCase)).find(c => c.id === action.id)
  if (!current) throw new IncidentValidationError('현재 조회 범위에서 후보를 찾지 못했습니다')
  if (current.revision !== action.revision) throw new IncidentConflict('다른 검토자가 변경했습니다. 새로고침 후 다시 확인하세요')
  let next: IncidentCase
  try { next = applyIncidentAction(current, input, action, actor) }
  catch (error) { throw new IncidentValidationError(error instanceof Error ? error.message : '잘못된 상태 변경입니다') }
  // History and state are one atomic document. Never overwrite a concurrent decision.
  const record = next as unknown as Record<string, unknown>
  const changed = action.revision === 0
    ? await db.insert(axIncidentReviews).values({ id: next.id, revision: next.revision, record }).onConflictDoNothing().returning({ id: axIncidentReviews.id })
    : await db.update(axIncidentReviews).set({ revision: next.revision, record, updatedAt: new Date() })
      .where(and(eq(axIncidentReviews.id, next.id), eq(axIncidentReviews.revision, action.revision))).returning({ id: axIncidentReviews.id })
  if (!changed.length) throw new IncidentConflict('다른 검토자가 변경했습니다. 새로고침 후 다시 확인하세요')
  return next
}

export const agentIncidentsPanel: AxPanel<IncidentReviewData> = { meta, async load(ctx) {
  if (!ctx.isAdmin) return panelError(meta, '관리자만 조회할 수 있습니다')
  if (process.env.AX_INCIDENT_REVIEW_ENABLED !== 'true') return panelNotConfigured(meta, '문제 검토 저장소를 준비 중입니다')
  try { return panelOk(meta, await readIncidentReview(ctx.days)) }
  catch { return panelError(meta, '문제 검토 데이터를 조회하지 못했습니다') }
} }
