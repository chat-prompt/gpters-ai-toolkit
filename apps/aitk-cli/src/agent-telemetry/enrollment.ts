import { isAbsolute } from 'node:path'
/** Authorize on the owner's machine; install with only a collector credential on the agent. */
import { openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs'
import { resolveToken } from '../auth.js'
import { readConfig } from '../config.js'
import { jsonOut } from '../output.js'

export interface CollectorEnrollment {
  version: 1
  agentId: string
  collectorId: string
  source: 'claude-code' | 'codex' | 'openclaw' | 'hermes'
  serverUrl: string
  intervalSeconds: number
  collectorToken: string
}
const ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/

function validateScope(value: Record<string, unknown>): void {
  if (typeof value.agentId !== 'string' || !ID.test(value.agentId) ||
    typeof value.collectorId !== 'string' || !ID.test(value.collectorId) ||
    !['claude-code', 'codex', 'openclaw', 'hermes'].includes(String(value.source)) ||
    !Number.isInteger(value.intervalSeconds) || Number(value.intervalSeconds) < 600 || Number(value.intervalSeconds) > 604800) {
    throw new Error('Invalid collector enrollment scope')
  }
  if (typeof value.serverUrl !== 'string') throw new Error('Invalid enrollment server')
  const url = new URL(value.serverUrl)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Enrollment server must be an HTTPS origin (HTTP is allowed only for localhost)')
  }
}

export function validateCollectorEnrollment(value: unknown): asserts value is CollectorEnrollment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid collector enrollment')
  const grant = value as Record<string, unknown>
  validateScope(grant)
  if (grant.version !== 1 || typeof grant.collectorToken !== 'string' || !/^agt_[a-f0-9]{64}$/.test(grant.collectorToken)) {
    throw new Error('Expected a collector-only credential, not a personal token')
  }
}

export async function readCollectorEnrollment(input: AsyncIterable<Uint8Array | string>): Promise<CollectorEnrollment> {
  let content = ''
  for await (const chunk of input) {
    content += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    if (Buffer.byteLength(content) > 4096) throw new Error('Collector enrollment exceeds 4096 bytes')
  }
  let value: unknown
  try { value = JSON.parse(content) } catch { throw new Error('Invalid collector enrollment JSON') }
  validateCollectorEnrollment(value)
  return value
}

export async function runAuthorizeCollector(options: {
  agentId: string; source?: string; collectorId?: string; serverUrl?: string; intervalSeconds: number; output?: string
}): Promise<void> {
  const serverUrl = (options.serverUrl ?? readConfig().serverUrl).replace(/\/+$/, '')
  const scope = { agentId: options.agentId, source: options.source, collectorId: options.collectorId,
    intervalSeconds: options.intervalSeconds, serverUrl }
  validateScope(scope)
  if (!options.output || !isAbsolute(options.output)) throw new Error('--output must name an absolute private enrollment file path')
  const token = resolveToken()
  if (!token) throw new Error('Authorize on the owner machine after aitk login')
  // Reserve a private file before issuing/rotating anything; never overwrite a grant.
  const fd = openSync(options.output, 'wx', 0o600)
  let enrolled = false
  let written = false
  try {
    const response = await fetch(`${serverUrl}/api/ax/agent-telemetry/enroll`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(scope), signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Collector authorization failed (HTTP ${response.status})`)
    enrolled = true
    const body = await response.json() as { ok?: boolean; collectorToken?: string }
    const grant = { ...scope, version: 1, collectorToken: body.collectorToken }
    if (body.ok !== true) throw new Error('Collector authorization was not accepted')
    validateCollectorEnrollment(grant)
    writeFileSync(fd, JSON.stringify(grant) + '\n')
    written = true
    jsonOut({ ok: true, agentId: grant.agentId, collectorId: grant.collectorId, output: options.output })
  } catch (cause) {
    if (enrolled) {
      try {
        const revoked = await fetch(`${serverUrl}/api/ax/agent-telemetry/enroll`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectorId: scope.collectorId }), signal: AbortSignal.timeout(30_000),
        })
        if (!revoked.ok) throw new Error('revoke failed')
      } catch { throw new Error('Enrollment file failed; owner must revoke the collector before retrying') }
    }
    throw cause
  } finally {
    closeSync(fd)
    if (!written) unlinkSync(options.output)
  }
}
