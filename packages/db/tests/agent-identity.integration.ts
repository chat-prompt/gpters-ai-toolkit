import { enrollAgentTelemetryCollector } from '../../lib/src/analytics/agent-telemetry-collectors'
/** Runs only against the named disposable local DB; never load production env files. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { issueAgentCredential, authenticateAgent, revokeAgentCredential, listAgentCredentials, revokeAllAgentCredentials, recordAgentRequest } from '../../lib/src/security/agent-identity'
import { closeDatabase } from '../src/index'

async function main() {
  const target = process.env.TEST_DATABASE_URL
  if (!target || process.env.CONFIRM_ISOLATED_AGENT_AUTH_TESTS !== 'run-isolated-agent-auth-tests') throw new Error('Explicit isolated test database confirmation required')
  const url = new URL(target)
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/aitk_agent_auth_test') throw new Error('Only disposable local aitk_agent_auth_test is allowed')
  process.env.DATABASE_URL = target
  process.env.DATABASE_DRIVER = 'postgres-js'
  const sql = postgres(target, { max: 1 })
  let created = false
  try {
    const existing = await sql`select count(*)::int n from information_schema.tables where table_schema='public'`
    assert.equal(existing[0].n, 0, 'Test database must be empty before setup')
    created = true
    console.log('isolated database: aitk_agent_auth_test; tables before: 0')
    await sql.unsafe(`create table users(id text primary key, account_status text not null, email text not null);
      create table allowed_external_accounts(email text primary key);
      create table organizations(id text primary key);
      create table org_memberships(user_id text, org_id text, status text);
      create table ax_agent_telemetry_collectors(
        collector_id text primary key, agent_id text, user_id text, source text, token_hash text unique,
        interval_seconds int default 3600, is_active boolean default true, revoked_at timestamptz,
        created_at timestamptz default now(), updated_at timestamptz default now(),
        last_seen_at timestamptz, last_success_at timestamptz, last_window_end timestamptz,
        last_batch_id text, last_health_status text, last_health_warnings jsonb default '[]',
        last_records_read int default 0, last_parse_failures int default 0);
      create unique index test_collector_scope on ax_agent_telemetry_collectors(agent_id,source) where is_active=true;`)
    await sql.unsafe(readFileSync(new URL('../drizzle/0039_aitk_agent_identity.sql', import.meta.url), 'utf8'))
    await sql`insert into users values ('test-owner-1','active','test-owner-1@gpters.org'),('test-owner-2','active','test-owner-2@gpters.org')`
    await sql`insert into organizations values ('test-org')`
    await sql`insert into org_memberships values ('test-owner-1','test-org','active'),('test-owner-2','test-org','active')`
    const first = await issueAgentCredential('test-owner-1', 'test-agent', true)
    assert.equal(first.orgId, 'test-org')
    assert.deepEqual(await authenticateAgent(first.token), { agentId:'test-agent', ownerUserId:'test-owner-1', orgId:'test-org', allowDeploy:true })
    assert.equal(await authenticateAgent('mcp_personal'), null)
    await assert.rejects(issueAgentCredential('test-owner-2', 'test-agent', true))
    assert.equal(await revokeAgentCredential('test-owner-2', 'test-agent'), false)
    const rotated = await issueAgentCredential('test-owner-1', 'test-agent', false)
    assert.equal(await authenticateAgent(first.token), null)
    assert.equal((await authenticateAgent(rotated.token))?.allowDeploy, false)
    await sql`update users set account_status='suspended' where id='test-owner-1'`
    assert.equal(await authenticateAgent(rotated.token), null)
    await assert.rejects(issueAgentCredential('test-owner-1', 'another-agent', false))
    await sql`update users set account_status='active' where id='test-owner-1'`
    await sql`update org_memberships set status='offboarded' where user_id='test-owner-1'`
    assert.equal(await authenticateAgent(rotated.token), null)
    await sql`update org_memberships set status='active' where user_id='test-owner-1'`
    await sql`update aitk_agent_credentials set expires_at=now()-interval '1 second' where agent_id='test-agent'`
    assert.equal(await authenticateAgent(rotated.token), null)
    await sql`insert into ax_agent_telemetry_collectors(collector_id,agent_id,user_id) values ('legacy-collector','collector-owned-agent','test-owner-1')`
    await assert.rejects(issueAgentCredential('test-owner-2','collector-owned-agent',false))
    const race = await Promise.allSettled([
      issueAgentCredential('test-owner-1','race-agent',false), issueAgentCredential('test-owner-2','race-agent',false),
    ])
    assert.equal(race.filter(r => r.status==='fulfilled').length,1)
    const enroll = (owner: string, agentId: string, source: 'claude-code' | 'codex' = 'claude-code') =>
      enrollAgentTelemetryCollector({ userId: owner, agentId, collectorId: `collector-${agentId}-${owner}-${source}`, source, intervalSeconds: 3600 })
    await assert.rejects(enroll('test-owner-2', 'test-agent'))
    await enroll('test-owner-1', 'test-agent')
    await assert.rejects(enroll('test-owner-2', 'test-agent', 'codex'))
    await issueAgentCredential('test-owner-1', 'test-agent', false)
    await enroll('test-owner-1', 'collector-first-agent')
    await assert.rejects(issueAgentCredential('test-owner-2', 'collector-first-agent', false))
    for (let i = 0; i < 6; i++) {
      const racedAgent = `cross-type-race-${i}`
      const crossType = await Promise.allSettled([
        issueAgentCredential('test-owner-1', racedAgent, false), enroll('test-owner-2', racedAgent),
      ])
      assert.equal(crossType.filter(r => r.status === 'fulfilled').length, 1)
    }
    assert.equal(await revokeAgentCredential('test-owner-1','test-agent'),true)
    assert.equal(await authenticateAgent(rotated.token),null)
    // External approval removal must invalidate existing delegated tokens as well as new issuance.
    await sql`insert into users values ('test-external-owner','active','test-agent-owner@example.test')`
    await sql`insert into org_memberships values ('test-external-owner','test-org','active')`
    await assert.rejects(issueAgentCredential('test-external-owner', 'external-agent', false))
    await sql`insert into allowed_external_accounts values ('test-agent-owner@example.test')`
    const external = await issueAgentCredential('test-external-owner', 'external-agent', false)
    assert.equal((await authenticateAgent(external.token))?.agentId, 'external-agent')
    await sql`delete from allowed_external_accounts where email='test-agent-owner@example.test'`
    assert.equal(await authenticateAgent(external.token), null)
    await assert.rejects(issueAgentCredential('test-external-owner', 'external-agent', false))
    // Inventory and bulk revocation never cross the authenticated owner's scope.
    const ownerOne = await issueAgentCredential('test-owner-1', 'inventory-owner-one', false)
    const ownerTwo = await issueAgentCredential('test-owner-2', 'inventory-owner-two', false)
    const inventory = await listAgentCredentials('test-owner-1')
    assert.ok(inventory.some(agent => agent.agentId === ownerOne.agentId))
    assert.ok(!inventory.some(agent => agent.agentId === ownerTwo.agentId))
    for (const agent of inventory) {
      assert.deepEqual(Object.keys(agent).sort(), ['agentId','orgId','allowDeploy','isActive','expiresAt','createdAt','updatedAt'].sort())
    }
    assert.equal(await revokeAllAgentCredentials('test-owner-1'), inventory.filter(agent => agent.isActive).length)
    assert.equal(await authenticateAgent(ownerOne.token), null)
    assert.equal((await authenticateAgent(ownerTwo.token))?.agentId, ownerTwo.agentId)
    assert.equal(await revokeAllAgentCredentials('test-owner-1'), 0)
    // Multiple active memberships require an explicit, currently active organization.
    await sql`insert into organizations values ('test-org-two'),('test-org-inactive')`
    await sql`insert into org_memberships values ('test-owner-1','test-org-two','active'),('test-owner-1','test-org-inactive','offboarded')`
    await assert.rejects(issueAgentCredential('test-owner-1', 'org-choice-agent', false))
    await assert.rejects(issueAgentCredential('test-owner-1', 'org-choice-agent', false, 'test-org-missing'))
    await assert.rejects(issueAgentCredential('test-owner-1', 'org-choice-agent', false, 'test-org-inactive'))
    const orgChoice = await issueAgentCredential('test-owner-1', 'org-choice-agent', false, 'test-org-two')
    assert.equal(orgChoice.orgId, 'test-org-two')
    assert.equal((await authenticateAgent(orgChoice.token))?.orgId, 'test-org-two')
    await assert.rejects(issueAgentCredential('test-owner-1', 'org-choice-agent', false, 'test-org'))
    await recordAgentRequest('test-agent','semantic_search','success')
    const events = await sql`select agent_id from aitk_agent_events`
    assert.deepEqual(events.map(r=>r.agent_id),['test-agent'])
    console.log('PASS: ownership, concurrent claiming, rotation, expiry, account approval removal, membership and organization choice, scoped inventory/revocation and agent-only receipts')
  } finally {
    await closeDatabase()
    if (created) await sql.unsafe('drop schema public cascade; create schema public;')
    const remaining = await sql`select count(*)::int n from information_schema.tables where table_schema='public'`
    console.log('isolated database tables after cleanup:',remaining[0].n)
    await sql.end()
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1 })
