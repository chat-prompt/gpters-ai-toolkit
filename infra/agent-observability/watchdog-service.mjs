/** Offline installer: never activates a scheduler or makes a network request. */
import { constants, openSync, closeSync, fstatSync, readFileSync, writeFileSync, mkdirSync, realpathSync, statSync, accessSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function ownedFile(path, maximum = 16_000) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const s = fstatSync(fd)
    if (!s.isFile() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o600 || s.size > maximum) throw Error('Private owned regular file required')
    return readFileSync(fd)
  } finally { closeSync(fd) }
}
function directory(path) {
  const s = statSync(path)
  if (!isAbsolute(path) || realpathSync(path) !== resolve(path) || !s.isDirectory() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o700) throw Error('Canonical owned private directory required')
}
function validateConfig(path) {
  const config = JSON.parse(ownedFile(path).toString())
  const origin = new URL(config.origin)
  if (origin.protocol !== 'https:' || origin.origin !== config.origin || typeof config.healthSecret !== 'string' || config.healthSecret.length < 32 || typeof config.slackToken !== 'string' || !config.slackToken || !/^[UW][A-Z0-9]{8,20}$/.test(config.recipient) || !isAbsolute(config.stateFile)) throw Error('Invalid watchdog configuration')
  directory(dirname(config.stateFile))
  if (realpathSync(dirname(path)) !== resolve(dirname(path))) throw Error('Canonical config directory required')
  return config
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const xml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const systemd = text => '"' + text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => '$$') + '"'
function pathArgument(path) {
  if (!isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path)) throw Error('Absolute single-line path required')
}
export function prepareWatchdog(options) {
  const { bundle, sha256, revision, node, config, prefix, platform } = options
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[a-f0-9]{64}$/.test(sha256) || !['darwin', 'linux'].includes(platform)) throw Error('Pinned revision, digest and supported platform required')
  for (const path of [bundle, node, config, prefix]) pathArgument(path)
  directory(prefix)
  validateConfig(config)
  accessSync(node, constants.X_OK)
  if (!statSync(node).isFile() || realpathSync(node) !== node) throw Error('Canonical executable Node path required')
  const bytes = readFileSync(bundle)
  if (bytes.length > 10_000_000 || hash(bytes) !== sha256) throw Error('Bundle digest mismatch')
  // Existing revision directories are never replaced, including interrupted installs.
  const release = join(prefix, revision)
  mkdirSync(release, { mode: 0o700 })
  const installedBundle = join(release, 'watch-monitor.mjs')
  writeFileSync(installedBundle, bytes, { mode: 0o600, flag: 'wx' })
  const label = 'org.gpters.ax-monitor-watchdog'
  const files = {}
  if (platform === 'darwin') {
    files[`${label}.plist`] = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[node, installedBundle, config].map(arg => `<string>${xml(arg)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>StartInterval</key><integer>300</integer><key>ProcessType</key><string>Background</string><key>StandardOutPath</key><string>${xml(join(prefix, 'watchdog.stdout.log'))}</string><key>StandardErrorPath</key><string>${xml(join(prefix, 'watchdog.stderr.log'))}</string></dict></plist>\n`
  } else {
    files[`${label}.service`] = `[Unit]\nDescription=Independent AX monitor watchdog\n[Service]\nType=oneshot\nExecStart=${[node, installedBundle, config].map(systemd).join(' ')}\nUMask=0077\nNoNewPrivileges=true\nTimeoutStartSec=60\n`
    files[`${label}.timer`] = `[Unit]\nDescription=Check independent AX monitor every five minutes\n[Timer]\nOnBootSec=1min\nOnUnitActiveSec=5min\nAccuracySec=15s\nUnit=${label}.service\n[Install]\nWantedBy=timers.target\n`
  }
  const schedules = Object.fromEntries(Object.entries(files).map(([name, content]) => {
    writeFileSync(join(release, name), content, { mode: 0o600, flag: 'wx' })
    return [name, hash(content)]
  }))
  const manifest = { version: 1, revision, sha256, node, config, platform, schedules }
  writeFileSync(join(release, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600, flag: 'wx' })
  return { prepared: true, release, schedulerChanged: false, networkRequests: 0 }
}
export function verifyWatchdog(release) {
  directory(release)
  const manifest = JSON.parse(ownedFile(join(release, 'manifest.json')).toString())
  if (manifest.version !== 1 || !/^[a-f0-9]{40}$/.test(manifest.revision) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !['darwin', 'linux'].includes(manifest.platform)) throw Error('Invalid manifest')
  if (hash(ownedFile(join(release, 'watch-monitor.mjs'), 10_000_000)) !== manifest.sha256) throw Error('Installed bundle changed')
  validateConfig(manifest.config)
  accessSync(manifest.node, constants.X_OK)
  if (realpathSync(manifest.node) !== manifest.node) throw Error('Node path changed')
  const expected = manifest.platform === 'darwin' ? ['org.gpters.ax-monitor-watchdog.plist'] : ['org.gpters.ax-monitor-watchdog.service', 'org.gpters.ax-monitor-watchdog.timer']
  if (JSON.stringify(Object.keys(manifest.schedules ?? {}).sort()) !== JSON.stringify(expected.sort())) throw Error('Invalid scheduler manifest')
  for (const name of expected) if (hash(ownedFile(join(release, name))) !== manifest.schedules[name]) throw Error('Scheduler file changed')
  return { verified: true, revision: manifest.revision, schedulerState: 'not-inspected', liveHealth: 'not-checked' }
}
function main() {
  const [command, ...args] = process.argv.slice(2)
  let result
  if (command === 'verify' && args.length === 1) result = verifyWatchdog(args[0])
  else if (command === 'prepare' && args.length === 1) result = prepareWatchdog(JSON.parse(ownedFile(args[0]).toString()))
  else throw Error('Usage: watchdog-service.mjs prepare PRIVATE_INSTALL_JSON | verify RELEASE_DIR')
  process.stdout.write(JSON.stringify(result) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main() } catch { process.stderr.write('Watchdog preparation/verification failed. Check private paths, permissions and pinned artifacts.\n'); process.exitCode = 2 }
}
