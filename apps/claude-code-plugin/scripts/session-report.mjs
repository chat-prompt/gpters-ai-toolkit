/**
 * SessionEnd reporter.
 *
 * The foreground hook only validates and counts the local transcript, then starts a
 * detached worker. The worker sends aggregate counts through `aitk report-session`.
 * Prompt text, transcript paths, and Claude session IDs never leave this process.
 */
import {
  constants,
  accessSync,
  closeSync,
  createReadStream,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const PLUGIN_ROOT = dirname(dirname(SCRIPT_PATH))

export const digest = value => createHash('sha256').update(value).digest('hex')

async function readHookInput() {
  process.stdin.setEncoding('utf8')
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Hook input too large')
  }
  const input = JSON.parse(raw)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid hook input')
  return input
}

function isInside(parent, child) {
  const childRelative = relative(parent, child)
  return childRelative === '' || (!childRelative.startsWith(`..${sep}`) && childRelative !== '..' && !isAbsolute(childRelative))
}

function resolveTranscript(input) {
  if (input.hook_event_name !== 'SessionEnd') throw new Error('Wrong hook event')
  if (typeof input.session_id !== 'string' || !input.session_id.trim() || input.session_id.length > 256) {
    throw new Error('Missing session ID')
  }
  if (typeof input.transcript_path !== 'string' || !input.transcript_path) throw new Error('Missing transcript path')

  const transcript = realpathSync(input.transcript_path)
  if (!isInside(projectsRoot(), transcript)) throw new Error('Transcript is outside Claude projects')

  const linkStat = lstatSync(input.transcript_path)
  const fileStat = statSync(transcript)
  if (linkStat.isSymbolicLink() || !fileStat.isFile() || fileStat.uid !== process.getuid() || fileStat.nlink !== 1) {
    throw new Error('Unsafe transcript')
  }
  if ((fileStat.mode & 0o077) !== 0 || basename(transcript) !== `${input.session_id}.jsonl`) {
    throw new Error('Unexpected transcript identity or permissions')
  }
  return { sessionId: input.session_id, transcript }
}

/** `CLAUDE_CONFIG_DIR`가 있으면 transcript도 그 아래 projects/에 놓인다. */
function projectsRoot() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  return realpathSync(join(configDir, 'projects'))
}

function isHumanText(text) {
  return typeof text === 'string' && !text.trimStart().startsWith('<system-reminder>')
}

function isUserPrompt(row) {
  if (!row || row.type !== 'user' || row.isMeta === true) return false
  const content = row.message?.content
  if (row.origin?.kind === 'human') {
    if (typeof content === 'string') return isHumanText(content)
    // 이미지 첨부나 붙여넣기는 content가 블록 배열로 저장된다.
    if (Array.isArray(content)) {
      return content.some(block => block?.type === 'image' || (block?.type === 'text' && isHumanText(block.text)))
    }
    return false
  }
  return Boolean(row.toolUseResult?.answers && typeof row.toolUseResult.answers === 'object')
}

/** Count unique user interactions without retaining their text. */
export async function countUserPrompts(transcript) {
  const promptIds = new Set()
  let withoutPromptId = 0
  const lines = createInterface({ input: createReadStream(transcript), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (!isUserPrompt(row)) continue
    if (typeof row.promptId === 'string' && row.promptId) promptIds.add(row.promptId)
    else withoutPromptId++
  }
  return promptIds.size + withoutPromptId
}

function stateDirectory() {
  const cacheRoot = process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
  const directory = join(cacheRoot, 'gpters-aitk', 'session-report')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const directoryStat = lstatSync(directory)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || directoryStat.uid !== process.getuid()) {
    throw new Error('Unsafe session report state directory')
  }
  if ((directoryStat.mode & 0o077) !== 0) throw new Error('Session report state directory must be private')
  return directory
}

function readReportedCount(file) {
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const fileStat = fstatSync(fd)
    if (!fileStat.isFile() || fileStat.uid !== process.getuid() || fileStat.nlink !== 1 ||
        (fileStat.mode & 0o777) !== 0o600 || fileStat.size > 4096) throw new Error('Unsafe report state')
    const state = JSON.parse(readFileSync(fd, 'utf8'))
    if (!Number.isSafeInteger(state.reportedCount) || state.reportedCount < 0) throw new Error('Invalid report state')
    return state.reportedCount
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function writeReportedCount(file, reportedCount) {
  const temporary = `${file}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try { writeFileSync(fd, JSON.stringify({ reportedCount })) } finally { closeSync(fd) }
  try { renameSync(temporary, file) } finally {
    try { unlinkSync(temporary) } catch {}
  }
}

const STALE_LOCK_MS = 10 * 60 * 1000

async function acquireLock(lock) {
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      mkdirSync(lock, { mode: 0o700 })
      return true
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      // A worker killed mid-run (shutdown at SessionEnd) leaves the lock behind forever.
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) rmdirSync(lock)
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  return false
}

function executableCandidates() {
  const candidates = []
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (directory) candidates.push(join(directory, 'aitk'))
  }
  candidates.push(
    join(homedir(), '.local', 'bin', 'aitk'),
    join(homedir(), '.local', 'share', 'mise', 'shims', 'aitk'),
    join(homedir(), '.asdf', 'shims', 'aitk'),
    join(homedir(), '.volta', 'bin', 'aitk'),
    '/opt/homebrew/bin/aitk',
    '/usr/local/bin/aitk'
  )
  for (const managerRoot of [
    join(homedir(), '.local', 'share', 'mise', 'installs', 'node'),
    join(homedir(), '.nvm', 'versions', 'node'),
  ]) {
    try {
      for (const version of readdirSync(managerRoot)) candidates.push(join(managerRoot, version, 'bin', 'aitk'))
    } catch {}
  }
  return [...new Set(candidates)]
}

function findAitk() {
  for (const candidate of executableCandidates()) {
    try {
      accessSync(candidate, constants.X_OK)
      const candidateStat = statSync(candidate)
      if (candidateStat.isFile()) return candidate
    } catch {}
  }
  return undefined
}

function run(executable, args) {
  return new Promise(resolve => {
    const child = spawn(executable, args, {
      env: { ...process.env, PATH: `${dirname(executable)}${delimiter}${process.env.PATH || ''}` },
      stdio: 'ignore',
    })
    child.once('error', () => resolve(false))
    child.once('exit', code => resolve(code === 0))
  })
}

async function worker(key, transcript, pluginVersion) {
  if (!/^[a-f0-9]{64}$/.test(key) || !isAbsolute(transcript) || !isInside(projectsRoot(), realpathSync(transcript))) return
  // transcript 스캔은 여기서 한다. SessionEnd 훅 전체 예산이 짧아 foreground에서는 파일을 읽지 않는다.
  const currentCount = await countUserPrompts(transcript)
  if (currentCount <= 0) return
  const directory = stateDirectory()
  const lock = join(directory, `${key}.lock`)
  if (!await acquireLock(lock)) return
  try {
    const stateFile = join(directory, `${key}.json`)
    const reportedCount = readReportedCount(stateFile)
    const delta = currentCount - reportedCount
    if (delta <= 0) return
    const aitk = findAitk()
    if (!aitk) return
    const sent = await run(aitk, ['report-session', '--count', String(delta), '--version', pluginVersion])
    if (sent) writeReportedCount(stateFile, currentCount)
  } finally {
    try { rmdirSync(lock) } catch {}
  }
}

function pluginVersion() {
  try {
    const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'))
    return typeof manifest.version === 'string' && manifest.version ? manifest.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

async function hook() {
  if (process.env.AITK_SESSION_REPORT === '0') return
  if (statSafe(join(homedir(), '.config', 'aitk', 'agent.json'))) return
  const input = await readHookInput()
  const { sessionId, transcript } = resolveTranscript(input)
  const key = digest(`${sessionId}\0${transcript}`)
  const child = spawn(process.execPath, [SCRIPT_PATH, '--worker', key, transcript, pluginVersion()], {
    detached: true,
    env: process.env,
    stdio: 'ignore',
  })
  child.unref()
}

function statSafe(path) {
  try { return statSync(path).isFile() } catch { return false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--worker') {
      await worker(process.argv[3] || '', process.argv[4] || '', process.argv[5] || 'unknown')
    } else {
      await hook()
    }
  } catch {
    // Optional aggregate telemetry must never block or add output to the session.
  }
}
