import { localCredentialPath } from '../../src/credential-store.js'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
import { spawnSync } from 'node:child_process'
import { importAgentCredential, readAgentConfig, readAgentToken, agentAuthPath, disconnectAgent } from '../../src/agent-auth.js'
let root: string
const token = `aia_${'a'.repeat(64)}`
const grant = { version: 1, agentId: 'example-agent', serverUrl: 'https://ai-toolkit.gpters.org',
  token, allowDeploy: false, expiresAt: '2099-01-01T00:00:00Z' }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-agent-'))
  vi.clearAllMocks()
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: token, stderr: '' } as never)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, actor: { type: 'agent', id: 'example-agent', allowDeploy: false } }))))
})
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.unstubAllGlobals() })
describe('agent credential storage', () => {
  it('uses explicit files without Keychain and fails closed on unsafe permissions', async () => {
    await importAgentCredential(grant, grant.serverUrl, root, 'file')
    expect(spawnSync).not.toHaveBeenCalled()
    expect(readAgentConfig(root)?.credentialStore).toBe('file')
    expect(readFileSync(agentAuthPath(root), 'utf8')).not.toContain(token)
    const path = localCredentialPath('agent', grant.agentId, root)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readAgentToken(root)).toBe(token)
    chmodSync(path, 0o644)
    expect(() => readAgentToken(root)).toThrow('fallback is disabled')
    expect(spawnSync).not.toHaveBeenCalled()
    disconnectAgent(root)
    expect(readAgentConfig(root)).toBe(null)
  })
  it('checks the remote identity and stores only non-secret config', async () => {
    await importAgentCredential(grant, grant.serverUrl, root)
    expect(readAgentConfig(root)?.agentId).toBe('example-agent')
    expect(readFileSync(agentAuthPath(root), 'utf8')).not.toContain(token)
    expect(readAgentToken(root)).toBe(token)
  })
  it('fails closed when Keychain is unavailable', async () => {
    await importAgentCredential(grant, grant.serverUrl, root)
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as never)
    expect(() => readAgentToken(root)).toThrow('fallback is disabled')
  })
  it('rejects personal credentials and unexpected servers without transmitting', async () => {
    await expect(importAgentCredential({ ...grant, token: 'mcp_personal' }, grant.serverUrl, root)).rejects.toThrow('Invalid')
    await expect(importAgentCredential({ ...grant, serverUrl: 'https://wrong.test' }, grant.serverUrl, root)).rejects.toThrow('does not match')
    expect(fetch).not.toHaveBeenCalled()
    expect(spawnSync).not.toHaveBeenCalled()
  })
  it('rejects an identity mismatch before changing Keychain', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, actor: { type: 'agent', id: 'other', allowDeploy: false } })))
    await expect(importAgentCredential(grant, grant.serverUrl, root)).rejects.toThrow('mismatch')
    expect(spawnSync).not.toHaveBeenCalled()
  })
  it('does not treat corrupt config as personal mode', () => {
    mkdirSync(join(root, '.config/aitk'), { recursive: true })
    writeFileSync(agentAuthPath(root), '{}')
    expect(() => readAgentConfig(root)).toThrow()
  })
})
