import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareWatchdog, verifyWatchdog } from './watchdog-service.mjs'
function fixture(t, platform = 'darwin') {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'watchdog-service-')))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const prefix = join(base, 'private install % $HOME space')
  mkdirSync(prefix, { mode: 0o700 })
  const state = join(base, 'state'); mkdirSync(state, { mode: 0o700 })
  const config = join(base, 'config.json')
  writeFileSync(config, JSON.stringify({ origin: 'https://example.test', healthSecret: 'anonymous-health-secret'.repeat(2), slackToken: 'anonymous-token', recipient: 'U123456789', stateFile: join(state, 'state.json') }), { mode: 0o600 })
  const bundle = join(base, 'input.mjs'); writeFileSync(bundle, '// anonymous reviewed fixture')
  const sha256 = createHash('sha256').update(readFileSync(bundle)).digest('hex')
  return { base, prefix, config, bundle, sha256, revision: 'a'.repeat(40), node: realpathSync(process.execPath), platform }
}
test('prepares and verifies private immutable launchd files without invoking node or scheduler', t => {
  const options = fixture(t); const result = prepareWatchdog(options)
  assert.equal(result.schedulerChanged, false); assert.equal(result.networkRequests, 0)
  assert.equal(verifyWatchdog(result.release).liveHealth, 'not-checked')
  const plist = readFileSync(join(result.release, 'org.gpters.ax-monitor-watchdog.plist'), 'utf8')
  assert.match(plist, /<integer>300<\/integer>/); assert.ok(plist.includes(options.config))
  assert.ok(!plist.includes('anonymous-token')); assert.ok(!plist.includes('anonymous-health-secret'))
  assert.throws(() => prepareWatchdog(options))
})
test('renders separate systemd timer and escaped literal percent path', t => {
  const result = prepareWatchdog(fixture(t, 'linux'))
  assert.equal(verifyWatchdog(result.release).verified, true)
  assert.match(readFileSync(join(result.release, 'org.gpters.ax-monitor-watchdog.service'), 'utf8'), /install %% \$\$HOME space/)
  assert.match(readFileSync(join(result.release, 'org.gpters.ax-monitor-watchdog.timer'), 'utf8'), /OnUnitActiveSec=5min/)
})
test('rejects wrong bundle hash before installing', t => {
  assert.throws(() => prepareWatchdog({ ...fixture(t), sha256: '0'.repeat(64) }), /digest mismatch/)
})
test('rejects world-readable configuration and symlinks', t => {
  const options = fixture(t)
  chmodSync(options.config, 0o644); assert.throws(() => prepareWatchdog(options), /Private owned/)
  chmodSync(options.config, 0o600)
  const link = join(options.base, 'link.json'); symlinkSync(options.config, link)
  assert.throws(() => prepareWatchdog({ ...options, config: link }))
})
test('rejects non-private install directory and line-break arguments', t => {
  const options = fixture(t); chmodSync(options.prefix, 0o755)
  assert.throws(() => prepareWatchdog(options), /private directory/)
  assert.throws(() => prepareWatchdog({ ...options, node: '/tmp/node\nother' }), /single-line/)
})
test('detects bundle tamper and scheduler tamper', t => {
  const result = prepareWatchdog(fixture(t))
  const bundle = join(result.release, 'watch-monitor.mjs'); const old = readFileSync(bundle)
  writeFileSync(bundle, 'changed'); assert.throws(() => verifyWatchdog(result.release), /bundle changed/)
  writeFileSync(bundle, old)
  writeFileSync(join(result.release, 'org.gpters.ax-monitor-watchdog.plist'), 'changed')
  assert.throws(() => verifyWatchdog(result.release), /Scheduler file changed/)
})
test('verify rejects configuration permission regression', t => {
  const options = fixture(t); const result = prepareWatchdog(options)
  chmodSync(options.config, 0o644)
  assert.throws(() => verifyWatchdog(result.release), /Private owned/)
})
test('rejects traversal schedule entries in untrusted manifest', t => {
  const result = prepareWatchdog(fixture(t))
  const path = join(result.release, 'manifest.json'); const manifest = JSON.parse(readFileSync(path))
  manifest.schedules['../other'] = '0'.repeat(64)
  writeFileSync(path, JSON.stringify(manifest)); assert.throws(() => verifyWatchdog(result.release), /scheduler manifest/)
})
