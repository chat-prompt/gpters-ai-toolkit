import { isAbsolute } from 'node:path'
import { parseCredentialStore } from '../credential-store.js'
import { openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs'
import { resolveToken } from '../auth.js'
import { readConfig } from '../config.js'
import { importAgentCredential, readAgentConfig, disconnectAgent } from '../agent-auth.js'
import { jsonOut } from '../output.js'

export async function runAgent(sub: string | undefined, flags: Record<string, string>): Promise<void> {
  if (sub === 'status') { jsonOut({ actor: readAgentConfig() }); return }
  if (sub === 'disconnect') { disconnectAgent(); jsonOut({ ok: true, disconnected: true }); return }
  if (sub === 'import') {
    if (flags['credential-stdin'] !== 'true') throw new Error('--credential-stdin is required; do not put credentials in arguments')
    let content = ''
    for await (const chunk of process.stdin) {
      content += chunk.toString()
      if (Buffer.byteLength(content) > 4096) throw new Error('Agent credential exceeds 4096 bytes')
    }
    let value: unknown
    try { value = JSON.parse(content) } catch { throw new Error('Invalid agent credential JSON') }
    await importAgentCredential(value, flags['server-url'] ?? readConfig().serverUrl, undefined, parseCredentialStore(flags['credential-store']))
    jsonOut({ ok: true, actor: readAgentConfig() }); return
  }
  if (sub !== 'authorize' && sub !== 'revoke' && sub !== 'list') throw new Error('Usage: aitk agent authorize|import|status|disconnect|list|revoke')
  const revokeAll = sub === 'revoke' && flags.all === 'true'
  if (revokeAll && flags.agent) throw new Error('Choose --agent or --all, not both')
  if (sub !== 'list' && !revokeAll && (!flags.agent || !/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(flags.agent))) throw new Error('--agent must be a stable agent ID')
  if (readAgentConfig()) throw new Error('Run owner authorization on the personal machine, not in agent mode')
  const token = resolveToken()
  if (!token || token.startsWith('aia_')) throw new Error('Owner authentication required')
  const serverUrl = (flags['server-url'] ?? readConfig().serverUrl).replace(/\/+$/, '')
  const url = new URL(serverUrl)
  if (url.origin !== serverUrl || url.protocol !== 'https:') throw new Error('An HTTPS origin is required')
  if (sub === 'authorize' && (!flags.output || !isAbsolute(flags.output))) throw new Error('--output must name an absolute private credential file path')
  if (flags.org === 'true') throw new Error('--org requires an organization ID')
  const fd = sub === 'authorize' ? openSync(flags.output, 'wx', 0o600) : undefined
  let written = false
  let issued = false
  try {
    const response = await fetch(`${serverUrl}/api/agents/credentials`, {
      method: sub === 'authorize' ? 'POST' : sub === 'list' ? 'GET' : 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(sub !== 'list' && { body: JSON.stringify(revokeAll ? { all: true } : { agentId: flags.agent, allowDeploy: flags['allow-deploy'] === 'true', ...(flags.org && { orgId: flags.org }) }) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Agent ${sub} failed (HTTP ${response.status})`)
    issued = sub === 'authorize'
    const body = await response.json() as { ok?: boolean; token?: string; agentId?: string; allowDeploy?: boolean; expiresAt?: string; orgId?: string; agents?: unknown[]; revoked?: number }
    if (body.ok !== true) throw new Error('Agent operation was not accepted')
    if (fd !== undefined) {
      if (!/^aia_[a-f0-9]{64}$/.test(body.token ?? '') || body.agentId !== flags.agent || typeof body.orgId !== 'string' || typeof body.allowDeploy !== 'boolean' || !body.expiresAt || Date.parse(body.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(body.expiresAt))) throw new Error('Invalid issued agent identity')
      writeFileSync(fd, JSON.stringify({ version: 1, agentId: body.agentId, token: body.token, serverUrl,
        allowDeploy: body.allowDeploy, expiresAt: body.expiresAt, orgId: body.orgId }) + '\n')
      written = true
    }
    if (sub === 'list') { jsonOut({ ok: true, agents: body.agents }); return }
    if (revokeAll) { jsonOut({ ok: true, revoked: body.revoked }); return }
    jsonOut({ ok: true, action: sub, agentId: flags.agent, ...(body.orgId && { orgId: body.orgId }), ...(flags.output && { output: flags.output }) })
  } catch (cause) {
    if (issued && !written) {
      const revoked = await fetch(`${serverUrl}/api/agents/credentials`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: flags.agent }), signal: AbortSignal.timeout(30_000),
      }).catch(() => null)
      if (!revoked?.ok) throw new Error('Credential transfer failed; revoke this agent from the owner machine before retrying')
    }
    throw cause
  } finally {
    if (fd !== undefined) { closeSync(fd); if (!written) unlinkSync(flags.output) }
  }
}
