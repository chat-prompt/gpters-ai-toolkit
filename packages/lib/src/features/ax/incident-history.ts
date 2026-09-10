import { and, desc, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { axIncidentReviews, db } from '@gpters/db'
import type { IncidentCase, IncidentState } from './incident-review'

export const incidentHistoryQuerySchema = z.object({
  agent: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/).optional(),
  source: z.enum(['claude-code', 'codex', 'openclaw', 'hermes', 'unknown']).optional(),
  state: z.enum(['candidate', 'reviewing', 'needs-info', 'confirmed', 'false-positive', 'fixed', 'verified']).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).max(4096).optional(),
}).strict()
export type IncidentHistoryQuery = z.infer<typeof incidentHistoryQuerySchema>
export interface IncidentHistoryItem {
  id: string; title: string; agentId: string; source: string; state: IncidentState
  updatedAt: string; revision: number; pendingReview: boolean; kind: 'report' | 'observation'
}
export interface IncidentHistoryPage { items: IncidentHistoryItem[]; nextCursor: string | null; pageSize: 50 }
const cursorSchema = z.object({ version: z.literal(1), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/), id: z.string().min(1).max(1000), filter: z.string() }).strict()
const filters = (query: IncidentHistoryQuery) => JSON.stringify([query.agent ?? '', query.source ?? '', query.state ?? ''])
export function decodeIncidentHistoryCursor(query: IncidentHistoryQuery) {
  if (!query.cursor) return null
  try {
    const result = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')))
    if (result.filter !== filters(query) || !Number.isFinite(Date.parse(result.at))) throw new Error()
    return result
  } catch { throw new Error('Invalid incident history cursor') }
}
export function incidentHistoryPage(rows: Array<{ id: string; revision: number; record: Record<string, unknown>; cursorAt: string }>, query: IncidentHistoryQuery): IncidentHistoryPage {
  const page = rows.slice(0, 50)
  const last = page.at(-1)
  return { pageSize: 50, items: page.map(row => {
    const record = row.record as unknown as IncidentCase
    return { id: row.id, revision: row.revision, title: record.report?.title ?? `${record.agentId} · ${record.phase}`,
      agentId: record.agentId, source: record.source, state: record.state, updatedAt: row.cursorAt,
      pendingReview: !!record.report?.pendingReview, kind: record.report ? 'report' : 'observation' }
  }), nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ version: 1, at: last.cursorAt, id: last.id, filter: filters(query) })).toString('base64url') : null }
}

/** Internal-admin route only. Summary projection excludes notes, actors, hashes and evidence URLs. */
export async function readIncidentHistory(input: IncidentHistoryQuery): Promise<IncidentHistoryPage> {
  const query = incidentHistoryQuerySchema.parse(input)
  const cursor = decodeIncidentHistoryCursor(query)
  const predicates = []
  if (query.agent) predicates.push(eq(sql<string>`${axIncidentReviews.record}->>'agentId'`, query.agent))
  if (query.source) predicates.push(eq(sql<string>`${axIncidentReviews.record}->>'source'`, query.source))
  if (query.state) predicates.push(eq(sql<string>`${axIncidentReviews.record}->>'state'`, query.state))
  if (cursor) predicates.push(or(sql`${axIncidentReviews.updatedAt} < ${cursor.at}::timestamptz`,
    and(sql`${axIncidentReviews.updatedAt} = ${cursor.at}::timestamptz`, sql`${axIncidentReviews.id} < ${cursor.id}`))!)
  // Preserve PostgreSQL microseconds: JS Date truncation can skip rows at page boundaries.
  const rows = await db.select({ id: axIncidentReviews.id, revision: axIncidentReviews.revision, record: axIncidentReviews.record,
    cursorAt: sql<string>`to_char(${axIncidentReviews.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(axIncidentReviews).where(and(...predicates)).orderBy(desc(axIncidentReviews.updatedAt), desc(axIncidentReviews.id)).limit(51)
  return incidentHistoryPage(rows, query)
}
