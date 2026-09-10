import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { readAgentConfig, readAgentToken, validateAgentConfig, type AgentAuthConfig } from '../../apps/aitk-cli/src/agent-auth'
import { readLocalCredential } from '../../apps/aitk-cli/src/credential-store'

/** An explicit report identity does not switch the process's HOME or default AITK mode. */
export function privateIdentityHome(path: string): string {
  try {
    if (!isAbsolute(path) || realpathSync(path) !== resolve(path) || realpathSync(path) === realpathSync(homedir())) throw new Error()
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error()
    return path
  } catch {
    throw new Error('Use an existing owned canonical 0700 identity directory')
  }
}

export function readReportAgentConfig(home?: string): AgentAuthConfig | null {
  if (home === undefined) return readAgentConfig()
  privateIdentityHome(home)
  let current = home
  try {
    for (const part of ['.config', 'aitk']) {
      current = join(current, part)
      const stat = lstatSync(current)
      if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error()
    }
    const fd = openSync(join(current, 'agent.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const before = fstatSync(fd)
      if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.size > 4096) throw new Error()
      const bytes = Buffer.alloc(4097)
      let length = 0, count = 0
      while ((count = readSync(fd, bytes, length, bytes.length - length, length)) > 0) {
        length += count
        if (length === bytes.length) throw new Error()
      }
      const after = fstatSync(fd)
      if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error()
      const value: unknown = JSON.parse(bytes.subarray(0, length).toString('utf8'))
      validateAgentConfig(value)
      if (value.credentialStore !== 'file') throw new Error()
      return { version: 1, agentId: value.agentId, serverUrl: value.serverUrl, credentialStore: 'file', ...(value.orgId && { orgId: value.orgId }) }
    } finally { closeSync(fd) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('Report identity must use owned private regular files and the file credential store')
  }
}

export function readReportAgentToken(home?: string, agentId?: string): string | undefined {
  if (home === undefined) return readAgentToken()
  privateIdentityHome(home)
  if (!agentId) throw new Error('Report agent identity is required')
  try { return readLocalCredential('agent', agentId, home) } catch {
    throw new Error('Private report credential unavailable; fallback is disabled')
  }
}
