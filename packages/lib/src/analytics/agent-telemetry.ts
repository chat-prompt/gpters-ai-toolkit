/** 검증이 끝난 에이전트 delta batch를 batchId 멱등으로 저장한다. */

import { axAgentTelemetryBatches, db } from '@gpters/db'
import type { AxAgentTelemetryBatch } from '../features/ax/agent-telemetry-contract'

export async function recordAgentTelemetryBatch(batch: AxAgentTelemetryBatch): Promise<{ inserted: boolean }> {
  const inserted = await db.insert(axAgentTelemetryBatches).values({
    batchId: batch.batchId,
    schemaVersion: batch.schemaVersion,
    agentId: batch.agentId,
    collectorInstanceId: batch.collectorInstanceId,
    runtime: batch.runtime,
    windowStart: new Date(batch.window.startUtc),
    windowEnd: new Date(batch.window.endUtc),
    collectedAt: new Date(batch.collectedAtUtc),
    inputTokens: batch.usage.inputTokens,
    outputTokens: batch.usage.outputTokens,
    cacheCreationInputTokens: batch.usage.cacheCreationInputTokens,
    cacheReadInputTokens: batch.usage.cacheReadInputTokens,
    thinkingTokens: batch.usage.thinkingTokens,
    thinkingTokensRelation: batch.usage.thinkingTokensRelation,
    sessions: batch.sessions,
    turns: batch.turns,
    models: batch.models,
    tools: batch.tools,
    skillLoads: batch.skillLoads,
    taskCategories: batch.taskCategories,
    executions: batch.executions,
    collection: batch.collection,
  // batchId 재전송뿐 아니라 동일 collector/window를 새 batchId로 재생성한 경우도
  // 멱등 성공으로 취급한다. 두 경우 모두 새 사용량을 더하지 않는다.
  }).onConflictDoNothing()
    .returning({ batchId: axAgentTelemetryBatches.batchId })
  return { inserted: inserted.length === 1 }
}
