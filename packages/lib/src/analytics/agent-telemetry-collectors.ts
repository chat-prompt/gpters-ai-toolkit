/** 설치형 agent telemetry collector의 등록·인증·freshness 기록. */

import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { axAgentTelemetryCollectors, db } from '@gpters/db'
import type { AxAgentTelemetryBatch } from '../features/ax/agent-telemetry-contract'

const COLLECTOR_TOKEN_PREFIX = 'agt_'
const COLLECTOR_TOKEN_HEX_LENGTH = 64

export class AgentTelemetryCollectorConflictError extends Error {
  constructor(message = 'An agent telemetry collector already owns this scope') {
    super(message)
    this.name = 'AgentTelemetryCollectorConflictError'
  }
}

export interface EnrollAgentTelemetryCollectorInput {
  collectorId: string
  userId: string
  agentId: string
  source: 'openclaw' | 'claude-code' | 'codex' | 'hermes'
  intervalSeconds: number
}

export interface AgentTelemetryCollectorCredential {
  collectorId: string
  agentId: string
  source: string
  userId: string
}

function collectorToken(): string {
  return `${COLLECTOR_TOKEN_PREFIX}${randomBytes(COLLECTOR_TOKEN_HEX_LENGTH / 2).toString('hex')}`
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function isAgentTelemetryCollectorToken(value: string): boolean {
  return new RegExp(`^${COLLECTOR_TOKEN_PREFIX}[a-f0-9]{${COLLECTOR_TOKEN_HEX_LENGTH}}$`).test(value)
}

export async function enrollAgentTelemetryCollector(
  input: EnrollAgentTelemetryCollectorInput
): Promise<{ collectorToken: string }> {
  const [byId] = await db.select({
    collectorId: axAgentTelemetryCollectors.collectorId,
    userId: axAgentTelemetryCollectors.userId,
    agentId: axAgentTelemetryCollectors.agentId,
    source: axAgentTelemetryCollectors.source,
  }).from(axAgentTelemetryCollectors).where(eq(axAgentTelemetryCollectors.collectorId, input.collectorId))

  const [byScope] = await db.select({
    collectorId: axAgentTelemetryCollectors.collectorId,
    userId: axAgentTelemetryCollectors.userId,
  }).from(axAgentTelemetryCollectors).where(and(
    eq(axAgentTelemetryCollectors.agentId, input.agentId),
    eq(axAgentTelemetryCollectors.source, input.source),
    eq(axAgentTelemetryCollectors.isActive, true),
  ))

  if (byId && (byId.userId !== input.userId || byId.agentId !== input.agentId || byId.source !== input.source)) {
    throw new AgentTelemetryCollectorConflictError('Collector ID belongs to a different telemetry scope')
  }
  if (byScope && (byScope.collectorId !== input.collectorId || byScope.userId !== input.userId)) {
    throw new AgentTelemetryCollectorConflictError()
  }

  const rawToken = collectorToken()
  const values = {
    collectorId: input.collectorId,
    userId: input.userId,
    agentId: input.agentId,
    source: input.source,
    tokenHash: hash(rawToken),
    intervalSeconds: input.intervalSeconds,
    isActive: true,
    revokedAt: null,
    updatedAt: new Date(),
  }

  if (byId) {
    await db.update(axAgentTelemetryCollectors)
      .set(values)
      .where(eq(axAgentTelemetryCollectors.collectorId, input.collectorId))
  } else {
    await db.insert(axAgentTelemetryCollectors).values(values)
  }
  return { collectorToken: rawToken }
}

export async function authenticateAgentTelemetryCollector(
  token: string
): Promise<AgentTelemetryCollectorCredential | null> {
  if (!isAgentTelemetryCollectorToken(token)) return null
  const [collector] = await db.select({
    collectorId: axAgentTelemetryCollectors.collectorId,
    agentId: axAgentTelemetryCollectors.agentId,
    source: axAgentTelemetryCollectors.source,
    userId: axAgentTelemetryCollectors.userId,
    isActive: axAgentTelemetryCollectors.isActive,
  }).from(axAgentTelemetryCollectors).where(eq(axAgentTelemetryCollectors.tokenHash, hash(token)))
  if (!collector?.isActive) return null
  return {
    collectorId: collector.collectorId,
    agentId: collector.agentId,
    source: collector.source,
    userId: collector.userId,
  }
}

export async function recordAgentTelemetryCollectorSuccess(
  credential: AgentTelemetryCollectorCredential,
  batch: AxAgentTelemetryBatch
): Promise<void> {
  await db.update(axAgentTelemetryCollectors).set({
    lastSeenAt: new Date(),
    lastSuccessAt: new Date(batch.collectedAtUtc),
    lastWindowEnd: new Date(batch.window.endUtc),
    lastBatchId: batch.batchId,
    lastHealthStatus: batch.collection.healthStatus,
    lastHealthWarnings: batch.collection.healthWarnings,
    lastRecordsRead: batch.collection.recordsRead,
    lastParseFailures: batch.collection.parseFailures,
    updatedAt: new Date(),
  }).where(and(
    eq(axAgentTelemetryCollectors.collectorId, credential.collectorId),
    eq(axAgentTelemetryCollectors.isActive, true),
  ))
}

export async function revokeAgentTelemetryCollector(collectorId: string, userId: string): Promise<boolean> {
  const rows = await db.update(axAgentTelemetryCollectors).set({
    isActive: false,
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(axAgentTelemetryCollectors.collectorId, collectorId),
    eq(axAgentTelemetryCollectors.userId, userId),
    eq(axAgentTelemetryCollectors.isActive, true),
  )).returning({ collectorId: axAgentTelemetryCollectors.collectorId })
  return rows.length > 0
}
