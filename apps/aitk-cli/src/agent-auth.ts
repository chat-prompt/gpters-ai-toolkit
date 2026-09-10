/** Agent mode is explicit and fail-closed: never fall back to a human token. */
import { existsSync, readFileSync, mkdirSync, openSync, writeFileSync, closeSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { parseCredentialStore, readLocalCredential, storeLocalCredential, deleteLocalCredential, type CredentialStore } from './credential-store.js'

export interface AgentAuthConfig { version: 1; agentId: string; serverUrl: string; credentialStore?: CredentialStore; orgId?: string }
export interface AgentAuthGrant extends AgentAuthConfig { token: string; allowDeploy: boolean; expiresAt: string }
const TOKEN = /^aia_[a-f0-9]{64}$/
const ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
export const agentAuthPath = (home = homedir()) => join(home, '.config', 'aitk', 'agent.json')

export function validateAgentConfig(value: unknown): asserts value is AgentAuthConfig {
  const c = value as AgentAuthConfig | undefined
  if (!c || c.version !== 1 || typeof c.agentId !== 'string' || !ID.test(c.agentId) || typeof c.serverUrl !== 'string') throw new Error('Invalid agent identity config')
  if (c.orgId !== undefined && (typeof c.orgId !== 'string' || !c.orgId || c.orgId.length > 200)) throw new Error('Invalid agent organization')
  parseCredentialStore(c.credentialStore)
  const url = new URL(c.serverUrl)
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== c.serverUrl ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Invalid agent server origin')
}

export function readAgentConfig(home = homedir()): AgentAuthConfig | null {
  const path = agentAuthPath(home)
  if (!existsSync(path)) return null
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  validateAgentConfig(value)
  return { version: 1, agentId: value.agentId, serverUrl: value.serverUrl, ...(value.orgId && { orgId: value.orgId }), ...(value.credentialStore && { credentialStore: value.credentialStore }) }
}
const service = (agentId: string) => `org.gpters.aitk.agent.${agentId}`
export function readAgentToken(home = homedir()): string | undefined {
  const config = readAgentConfig(home)
  if (!config) return undefined
  if (config.credentialStore === 'file') {
    try { return readLocalCredential('agent', config.agentId, home) } catch {
      throw new Error('Agent credential unavailable; personal authentication fallback is disabled')
    }
  }
  const result = spawnSync('/usr/bin/security', ['find-generic-password', '-a', config.agentId, '-s', service(config.agentId), '-w'], { encoding: 'utf8' })
  const token = result.stdout?.trim()
  if (result.status !== 0 || !token || !TOKEN.test(token)) throw new Error('Agent credential unavailable; personal authentication fallback is disabled')
  return token
}

export async function importAgentCredential(input: unknown, expectedServerUrl: string, home = homedir(), credentialStore: CredentialStore = 'macos-keychain'): Promise<void> {
  parseCredentialStore(credentialStore)
  validateAgentConfig(input)
  const grant = input as AgentAuthGrant
  if (typeof grant.token !== 'string' || !TOKEN.test(grant.token) || typeof grant.allowDeploy !== 'boolean' || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now()) throw new Error('Invalid or expired agent credential')
  if (grant.serverUrl !== expectedServerUrl.replace(/\/+$/, '')) throw new Error('Agent server does not match the expected server')
  if (existsSync(agentAuthPath(home))) throw new Error('Agent identity already configured; disconnect explicitly before replacing it')
  const response = await fetch(`${grant.serverUrl}/api/agents/mcp?action=whoami`, {
    method: 'POST', headers: { Authorization: `Bearer ${grant.token}`, 'Content-Type': 'application/json' },
    body: '{}', redirect: 'error', signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error('Agent credential verification failed')
  const identity = await response.json() as { success?: boolean; actor?: { type?: string; id?: string; allowDeploy?: boolean; orgId?: string } }
  if (identity.success !== true || identity.actor?.type !== 'agent' || identity.actor.id !== grant.agentId || identity.actor.allowDeploy !== grant.allowDeploy || (grant.orgId !== undefined && identity.actor.orgId !== grant.orgId)) throw new Error('Agent identity mismatch')
  if (credentialStore === 'file') {
    storeLocalCredential('agent', grant.agentId, grant.token, home)
  } else {
    const stored = spawnSync('/usr/bin/security', ['add-generic-password', '-a', grant.agentId, '-s', service(grant.agentId), '-w', grant.token, '-U'], { encoding: 'utf8' })
    if (stored.status !== 0) throw new Error('Unable to store agent credential in Keychain')
  }
  const config: AgentAuthConfig = { version: 1, agentId: grant.agentId, serverUrl: grant.serverUrl, credentialStore, ...(grant.orgId && { orgId: grant.orgId }) }
  const tmp = `${agentAuthPath(home)}.${randomUUID()}.tmp`
  try {
    mkdirSync(join(home, '.config', 'aitk'), { recursive: true, mode: 0o700 })
    const fd = openSync(tmp, 'wx', 0o600)
    try { writeFileSync(fd, JSON.stringify(config) + '\n') } finally { closeSync(fd) }
    if (existsSync(agentAuthPath(home))) throw new Error('Agent configuration changed during import')
    renameSync(tmp, agentAuthPath(home))
  } catch (cause) {
    if (credentialStore === 'file') deleteLocalCredential('agent', grant.agentId, home)
    else spawnSync('/usr/bin/security', ['delete-generic-password', '-a', grant.agentId, '-s', service(grant.agentId)], { stdio: 'ignore' })
    throw cause
  } finally { if (existsSync(tmp)) unlinkSync(tmp) }
}

export function disconnectAgent(home = homedir()): void {
  const config = readAgentConfig(home)
  if (!config) return
  if (config.credentialStore === 'file') {
    deleteLocalCredential('agent', config.agentId, home)
    unlinkSync(agentAuthPath(home))
    return
  }
  const result = spawnSync('/usr/bin/security', ['delete-generic-password', '-a', config.agentId, '-s', service(config.agentId)], { encoding: 'utf8' })
  if (result.status !== 0 && result.status !== 44) throw new Error('Unable to remove agent credential; configuration retained')
  unlinkSync(agentAuthPath(home))
}
