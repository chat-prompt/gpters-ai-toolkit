import { chmodSync, existsSync, linkSync, mkdtempSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteLocalCredential, localCredentialPath, parseCredentialStore, readLocalCredential, storeLocalCredential } from '../src/credential-store.js'
let home: string
const token = `aia_${'a'.repeat(64)}`
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'aitk-private-store-')) })
afterEach(() => rmSync(home, { recursive: true, force: true }))
describe('explicit private credential files', () => {
  it('persists only scoped credentials at 0600 inside 0700 and refuses replacement', () => {
    storeLocalCredential('agent', 'test-agent', token, home)
    const path = localCredentialPath('agent', 'test-agent', home)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700)
    expect(readLocalCredential('agent', 'test-agent', home)).toBe(token)
    expect(() => storeLocalCredential('agent', 'test-agent', token, home)).toThrow()
    expect(deleteLocalCredential('agent', 'test-agent', home)).toBe(true)
    expect(existsSync(path)).toBe(false)
  })
  it.each(['mcp_personal', `agt_${'b'.repeat(64)}`])('rejects unrelated credential types before creating files', value => {
    expect(() => storeLocalCredential('agent', 'test-agent', value, home)).toThrow()
    expect(existsSync(join(home, '.config'))).toBe(false)
  })
  it.each(['permissions', 'hardlink', 'symlink', 'directory'])('refuses insecure %s on read', kind => {
    storeLocalCredential('agent', 'test-agent', token, home)
    const path = localCredentialPath('agent', 'test-agent', home)
    if (kind === 'permissions') chmodSync(path, 0o644)
    if (kind === 'directory') chmodSync(dirname(path), 0o755)
    if (kind === 'hardlink') linkSync(path, join(home, 'copy'))
    if (kind === 'symlink') { linkSync(path, join(home, 'copy')); unlinkSync(path); symlinkSync(join(home, 'copy'), path) }
    expect(() => readLocalCredential('agent', 'test-agent', home)).toThrow()
  })
  it('does not silently select files for unknown storage providers', () => {
    expect(parseCredentialStore()).toBe('macos-keychain')
    expect(() => parseCredentialStore('typo')).toThrow()
  })
})
