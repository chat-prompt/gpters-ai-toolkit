import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { importAgentCredential, agentAuthPath } from '../src/agent-auth.js'

const homes: string[] = []
const grant = (extra: Record<string, unknown> = {}) => ({
  version: 1, agentId: 'example-agent', serverUrl: 'https://toolkit.test', token: `aia_${'a'.repeat(64)}`,
  allowDeploy: true, expiresAt: new Date(Date.now() + 86400_000).toISOString(), ...extra,
})
const whoami = (actor: Record<string, unknown>) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ success: true, actor: { type: 'agent', id: 'example-agent', allowDeploy: true, ...actor } })))
function home() { const dir = mkdtempSync(join(tmpdir(), 'aitk-agent-')); homes.push(dir); return dir }
afterEach(() => { vi.restoreAllMocks(); for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('agent credential import — edit scope', () => {
  it('rejects a grant whose organization edit scope differs from the server identity', async () => {
    whoami({ allowOrgEdit: false })
    const dir = home()
    await expect(importAgentCredential(grant({ allowOrgEdit: true }), 'https://toolkit.test', dir, 'file')).rejects.toThrow('Agent identity mismatch')
    expect(existsSync(agentAuthPath(dir))).toBe(false)
  })

  it('accepts a matching scope, and older grants without the field', async () => {
    whoami({ allowOrgEdit: true })
    await importAgentCredential(grant({ allowOrgEdit: true }), 'https://toolkit.test', home(), 'file')
    whoami({})
    await importAgentCredential(grant(), 'https://toolkit.test', home(), 'file')
  })
})
