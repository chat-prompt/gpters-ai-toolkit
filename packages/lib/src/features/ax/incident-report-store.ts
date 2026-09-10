import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db, axIncidentReviews } from '@gpters/db'
import type { AgentPrincipal } from '../../security/agent-identity'
import type { IncidentCase } from './incident-review'
import type { IncidentReportSubmission, IncidentSupplement } from './incident-report'
import { IncidentConflict, IncidentValidationError } from './incident-review-store'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function reportId(agent: Pick<AgentPrincipal,'orgId'|'agentId'>, issueUrl: string): string {
  return `report_${digest([agent.orgId, agent.agentId, issueUrl]).slice(0,32)}`
}
export function createReportCase(agent: Pick<AgentPrincipal,'orgId'|'agentId'>, input: IncidentReportSubmission, now = new Date().toISOString()): IncidentCase {
  if (Date.parse(input.occurredAt) > Date.parse(now)) throw new IncidentValidationError('발생 시각은 미래일 수 없습니다')
  if (input.reaction && Number(input.reaction.eventTs) * 1000 > Date.parse(now)) throw new IncidentValidationError('반응 시각은 미래일 수 없습니다')
  return { id: reportId(agent,input.issueUrl), revision: 1, state: 'candidate', agentId: agent.agentId, source: input.source, phase: 'task', evidence: 'self-reported',
    createdAt: now, updatedAt: now, lastFailureAt: input.occurredAt, lastFailureIds: [], failureCount: 0, examples: [],
    history: [{at:now,actor:`agent:${agent.agentId}`,action:'reported',reason:input.summary,evidenceRef:input.issueUrl}],
    report: {...input,orgId:agent.orgId,reporterAgentId:agent.agentId,inputDigest:digest(input),consentEvidence:'agent-attested',pendingReview:true,supplements:[]},
  }
}
const scopeWhere = (agent: Pick<AgentPrincipal,'orgId'|'agentId'>, id: string) => and(eq(axIncidentReviews.id,id),
  sql`${axIncidentReviews.record}->'report'->>'orgId' = ${agent.orgId}`,
  sql`${axIncidentReviews.record}->'report'->>'reporterAgentId' = ${agent.agentId}`)

export async function readOwnIncidentReport(agent: Pick<AgentPrincipal,'orgId'|'agentId'>, id: string): Promise<IncidentCase | null> {
  const [row] = await db.select().from(axIncidentReviews).where(scopeWhere(agent,id)).limit(1)
  return row ? row.record as unknown as IncidentCase : null
}
export async function submitIncidentReport(agent: Pick<AgentPrincipal,'orgId'|'agentId'>, input: IncidentReportSubmission) {
  const record = createReportCase(agent,input)
  const inserted = await db.insert(axIncidentReviews).values({id:record.id,revision:record.revision,record:record as unknown as Record<string,unknown>})
    .onConflictDoNothing().returning({id:axIncidentReviews.id})
  if (inserted.length) return {record,replayed:false}
  const existing = await readOwnIncidentReport(agent,record.id)
  if (!existing || existing.report?.inputDigest !== record.report?.inputDigest) throw new IncidentConflict('같은 문제 메시지가 이미 접수됐습니다. 기존 보고를 조회하고 보완 API를 사용하세요')
  return {record:existing,replayed:true}
}
export function appendReportSupplement(current: IncidentCase, input: IncidentSupplement, now = new Date().toISOString()): IncidentCase {
  if (!current.report) throw new IncidentValidationError('에이전트가 접수한 보고가 아닙니다')
  const hash = digest(input)
  const duplicate = current.report.supplements.find(s => s.updateId === input.updateId)
  if (duplicate) {
    if (duplicate.digest !== hash) throw new IncidentConflict('같은 updateId의 내용을 변경할 수 없습니다')
    return current
  }
  if (input.testedAt && Date.parse(input.testedAt) > Date.parse(now)) throw new IncidentValidationError('재검증 시각은 미래일 수 없습니다')
  if (current.report.supplements.length >= 100) throw new IncidentValidationError('보완 자료 한도에 도달했습니다. 검토자에게 문의하세요')
  return {...current,revision:current.revision+1,updatedAt:now,
    report:{...current.report,pendingReview:true,supplements:[...current.report.supplements,{...input,at:now,digest:hash}]}}
}
export async function supplementIncidentReport(agent: Pick<AgentPrincipal,'orgId'|'agentId'>, id: string, input: IncidentSupplement) {
  for (let attempt=0;attempt<3;attempt++) {
    const current = await readOwnIncidentReport(agent,id)
    if (!current) return null
    const next = appendReportSupplement(current,input)
    if (next === current) return {record:current,replayed:true}
    const saved = await db.update(axIncidentReviews).set({revision:next.revision,record:next as unknown as Record<string,unknown>,updatedAt:new Date()})
      .where(and(scopeWhere(agent,id),eq(axIncidentReviews.revision,current.revision))).returning({id:axIncidentReviews.id})
    if (saved.length) return {record:next,replayed:false}
  }
  throw new IncidentConflict('검토 기록이 변경 중입니다. 같은 updateId로 재시도하세요')
}
