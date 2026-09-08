import { eq } from 'drizzle-orm'
import { db, aitkAgentOwners, aitkAgentCredentials, axAgentTelemetryCollectors } from '@gpters/db'

/** Shared atomic reservation across both credential types, including concurrent first registration. */
export async function claimAgentOwnership(agentId: string, ownerUserId: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(agentId)) throw new Error('Invalid agent ID')
  // Respect legacy records on first use. Revocation does not transfer ownership.
  const collectors = await db.select({ ownerUserId: axAgentTelemetryCollectors.userId }).from(axAgentTelemetryCollectors)
    .where(eq(axAgentTelemetryCollectors.agentId, agentId))
  const credentials = await db.select({ ownerUserId: aitkAgentCredentials.ownerUserId }).from(aitkAgentCredentials)
    .where(eq(aitkAgentCredentials.agentId, agentId))
  if ([...collectors, ...credentials].some(row => row.ownerUserId !== ownerUserId)) {
    throw new Error('Agent identity belongs to another owner')
  }
  const [claimed] = await db.insert(aitkAgentOwners).values({ agentId, ownerUserId }).onConflictDoUpdate({
    target: aitkAgentOwners.agentId,
    set: { ownerUserId },
    setWhere: eq(aitkAgentOwners.ownerUserId, ownerUserId),
  }).returning({ agentId: aitkAgentOwners.agentId })
  if (!claimed) throw new Error('Agent identity belongs to another owner')
}
