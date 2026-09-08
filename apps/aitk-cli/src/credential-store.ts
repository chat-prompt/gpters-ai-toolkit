/** Explicit local storage for scoped agent credentials; never used as a Keychain fallback. */
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type CredentialStore = 'macos-keychain' | 'file'
export function parseCredentialStore(value?: string): CredentialStore {
  if (value === undefined || value === 'macos-keychain') return 'macos-keychain'
  if (value === 'file') return value
  throw new Error('--credential-store must be macos-keychain or file')
}
function credentialDirectory(home: string, create = false): string {
  let current = home
  for (const part of ['.config', 'aitk', 'credentials']) {
    current = join(current, part)
    if (create) {
      try { mkdirSync(current, { mode: 0o700 }) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    const stat = lstatSync(current)
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0 ||
      (part === 'credentials' && (stat.mode & 0o077) !== 0)) {
      throw new Error('Credential directory must be owned by this user, private, and not a symlink')
    }
  }
  return current
}
export function localCredentialPath(kind: 'agent' | 'collector', id: string, home = homedir()): string {
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(id)) throw new Error('Invalid credential identity')
  return join(home, '.config', 'aitk', 'credentials', `${kind}-${id}.token`)
}
function validateToken(kind: 'agent' | 'collector', token: string): void {
  const pattern = kind === 'agent' ? /^aia_[a-f0-9]{64}$/ : /^agt_[a-f0-9]{64}$/
  if (!pattern.test(token)) throw new Error('Expected a scoped agent credential')
}
function checkFile(fd: number): void {
  const stat = fstatSync(fd)
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 4096) {
    throw new Error('Credential file must be an owned, private (0600), unlinked regular file')
  }
}
export function storeLocalCredential(kind: 'agent' | 'collector', id: string, token: string, home = homedir()): void {
  validateToken(kind, token)
  const path = localCredentialPath(kind, id, home)
  credentialDirectory(home, true)
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    checkFile(fd)
    writeFileSync(fd, `${token}\n`)
  } catch (error) {
    unlinkSync(path)
    throw error
  } finally { closeSync(fd) }
}
export function readLocalCredential(kind: 'agent' | 'collector', id: string, home = homedir()): string {
  const path = localCredentialPath(kind, id, home)
  credentialDirectory(home)
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    checkFile(fd)
    const token = readFileSync(fd, 'utf8').trim()
    validateToken(kind, token)
    return token
  } finally { closeSync(fd) }
}
export function deleteLocalCredential(kind: 'agent' | 'collector', id: string, home = homedir()): boolean {
  const path = localCredentialPath(kind, id, home)
  try {
    credentialDirectory(home)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.uid !== process.getuid?.()) throw new Error('Refusing to remove an unexpected credential file')
    unlinkSync(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
