import { claimAgentOwnership } from './agent-ownership'
import { isAllowedAccountEmail } from '../account-access'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db, aitkAgentCredentials, aitkAgentEvents, users, orgMemberships } from '@gpters/db'

export const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,99}$/
export const AGENT_TOKEN_PATTERN = /^aia_[a-f0-9]{64}$/
export interface AgentPrincipal {
  agentId: string
  ownerUserId: string
  orgId: string
  allowDeploy: boolean
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function issueAgentCredential(ownerUserId: string, agentId: string, allowDeploy: boolean, orgId?: string) {
  if (!AGENT_ID_PATTERN.test(agentId)) throw new Error('Invalid agent ID')
  if (orgId !== undefined && (typeof orgId !== 'string' || !orgId.trim())) throw new Error('Invalid organization ID')
  const memberships = await db.select({ orgId: orgMemberships.orgId, email: users.email }).from(orgMemberships)
    .innerJoin(users, eq(users.id, orgMemberships.userId))
    .where(and(eq(users.id, ownerUserId), eq(users.accountStatus, 'active'), eq(orgMemberships.status, 'active'),
      ...(orgId === undefined ? [] : [eq(orgMemberships.orgId, orgId)])))
  if (new Set(memberships.map(member => member.orgId)).size > 1) throw new Error('Choose an organization explicitly')
  const [member] = memberships
  if (!member) throw new Error('An active organization membership is required')
  if (!(await isAllowedAccountEmail(member.email))) throw new Error('Owner account access is not allowed')
  await claimAgentOwnership(agentId, ownerUserId)
  const token = `aia_${randomBytes(32).toString('hex')}`
  const expiresAt = new Date(Date.now() + 90 * 86400_000)
  const [row] = await db.insert(aitkAgentCredentials).values({
    agentId, ownerUserId, orgId: member.orgId, tokenHash: hash(token), allowDeploy, expiresAt,
  }).onConflictDoUpdate({
    target: aitkAgentCredentials.agentId,
    set: { tokenHash: hash(token), allowDeploy, expiresAt, isActive: true, updatedAt: new Date() },
    setWhere: and(eq(aitkAgentCredentials.ownerUserId, ownerUserId), eq(aitkAgentCredentials.orgId, member.orgId)),
  }).returning({ agentId: aitkAgentCredentials.agentId })
  if (!row) throw new Error('Agent identity belongs to another owner or organization')
  return { token, agentId, orgId: member.orgId, expiresAt: expiresAt.toISOString(), allowDeploy }
}

export async function authenticateAgent(token: string): Promise<AgentPrincipal | null> {
  if (!AGENT_TOKEN_PATTERN.test(token)) return null
  const [agent] = await db.select({
    agentId: aitkAgentCredentials.agentId, ownerUserId: aitkAgentCredentials.ownerUserId,
    orgId: aitkAgentCredentials.orgId, allowDeploy: aitkAgentCredentials.allowDeploy,
    ownerEmail: users.email,
  }).from(aitkAgentCredentials)
    .innerJoin(users, eq(users.id, aitkAgentCredentials.ownerUserId))
    .innerJoin(orgMemberships, and(eq(orgMemberships.userId, users.id), eq(orgMemberships.orgId, aitkAgentCredentials.orgId)))
    .where(and(eq(aitkAgentCredentials.tokenHash, hash(token)), eq(aitkAgentCredentials.isActive, true),
      gt(aitkAgentCredentials.expiresAt, new Date()), eq(users.accountStatus, 'active'), eq(orgMemberships.status, 'active'))).limit(1)
  if (!agent || !(await isAllowedAccountEmail(agent.ownerEmail))) return null
  return { agentId: agent.agentId, ownerUserId: agent.ownerUserId, orgId: agent.orgId, allowDeploy: agent.allowDeploy }
}

/** Owner-scoped inventory deliberately excludes token hashes and owner account details. */
export async function listAgentCredentials(ownerUserId: string) {
  return db.select({
    agentId: aitkAgentCredentials.agentId,
    orgId: aitkAgentCredentials.orgId,
    allowDeploy: aitkAgentCredentials.allowDeploy,
    isActive: aitkAgentCredentials.isActive,
    expiresAt: aitkAgentCredentials.expiresAt,
    createdAt: aitkAgentCredentials.createdAt,
    updatedAt: aitkAgentCredentials.updatedAt,
  }).from(aitkAgentCredentials)
    .where(eq(aitkAgentCredentials.ownerUserId, ownerUserId))
    .orderBy(aitkAgentCredentials.agentId)
}

export async function revokeAllAgentCredentials(ownerUserId: string): Promise<number> {
  const rows = await db.update(aitkAgentCredentials).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(aitkAgentCredentials.ownerUserId, ownerUserId), eq(aitkAgentCredentials.isActive, true)))
    .returning({ agentId: aitkAgentCredentials.agentId })
  return rows.length
}

export async function revokeAgentCredential(ownerUserId: string, agentId: string): Promise<boolean> {
  const rows = await db.update(aitkAgentCredentials).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(aitkAgentCredentials.agentId, agentId), eq(aitkAgentCredentials.ownerUserId, ownerUserId)))
    .returning({ agentId: aitkAgentCredentials.agentId })
  return rows.length === 1
}

export async function recordAgentRequest(agentId: string, tool: string, status: string, skillId?: string, requestId = randomUUID(), details?: Record<string, unknown>) {
  await db.insert(aitkAgentEvents).values({ requestId, agentId, tool, status,
    skillId: typeof skillId === 'string' && skillId.length <= 200 ? skillId : null, details })
}

/** Explicit allowlist: personal usage, session reporting, identity management, deletes and admin tools are never allowed. */
const READ_TOOLS = new Set(['semantic_search', 'search_plugins', 'get_plugin_content', 'list_plugins', 'get_plugins_by_category', 'check_updates'])
const REPORT_TOOLS = new Set(['report_search_skip', 'report_skill_outcome', 'report_skill_execution_started', 'report_skill_execution'])
export function canAgentCall(agent: Pick<AgentPrincipal, 'allowDeploy'>, tool: string): boolean {
  return READ_TOOLS.has(tool) || REPORT_TOOLS.has(tool) || (agent.allowDeploy && tool === 'deploy_skill')
}
