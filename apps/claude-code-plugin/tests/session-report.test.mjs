import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { countUserPrompts } from '../scripts/session-report.mjs'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function row(promptId, content, extra = {}) {
  return {
    type: 'user',
    promptId,
    message: { role: 'user', content },
    origin: { kind: 'human' },
    ...extra,
  }
}

function writeTranscript(path, rows) {
  writeFileSync(path, `${rows.map(value => JSON.stringify(value)).join('\n')}\n`, { mode: 0o600 })
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'aitk-session-hook-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const home = join(root, "home's space")
  const projects = join(home, '.claude', 'projects', 'project-fixture')
  const cache = join(root, 'cache')
  const bin = join(root, 'bin')
  const reports = join(root, 'reports')
  for (const path of [projects, cache, bin]) mkdirSync(path, { recursive: true })
  writeFileSync(join(bin, 'aitk'), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$HOOK_TEST_REPORT"\nexit "${HOOK_TEST_EXIT:-0}"\n', { mode: 0o700 })
  const env = {
    HOME: home,
    XDG_CACHE_HOME: cache,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOOK_TEST_REPORT: reports,
  }
  function transcript(sessionId = 'session-one', rows = []) {
    const path = join(projects, `${sessionId}.jsonl`)
    writeTranscript(path, rows)
    return path
  }
  function run(input) {
    const result = spawnSync('/bin/bash', [join(source, 'scripts', 'session-report.sh')], {
      env,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 5000,
    })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  }
  return { root, home, projects, cache, env, reports, transcript, run }
}

async function waitFor(check, message) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail(message)
}

test('counts actual user interactions once per prompt ID', async t => {
  const f = fixture(t)
  const path = f.transcript('count-session', [
    row('prompt-1', '<command-message>rona-plan</command-message>'),
    { ...row('prompt-1', [{ type: 'text', text: 'loaded skill contents' }]), isMeta: true, origin: undefined },
    row('reminder', '<system-reminder>generated context</system-reminder>'),
    row('prompt-2', '첫 번째 실제 답변'),
    { type: 'user', promptId: 'prompt-2', message: { role: 'user', content: [{ type: 'tool_result' }] }, toolUseResult: { answers: { q: 'A' } } },
    { type: 'user', promptId: 'tool-only', message: { role: 'user', content: [{ type: 'tool_result' }] } },
    { type: 'user', promptId: 'prompt-3', message: { role: 'user', content: [{ type: 'tool_result' }] }, toolUseResult: { answers: { q: 'B' } } },
    { type: 'user', message: { role: 'user', content: 'prompt without an ID' }, origin: { kind: 'human' } },
    row('prompt-4', [{ type: 'text', text: '이미지 첨부 질문' }, { type: 'image', source: { type: 'base64', data: '' } }]),
    row('reminder-blocks', [{ type: 'text', text: '<system-reminder>only generated</system-reminder>' }]),
    { type: 'assistant', promptId: 'assistant', message: { role: 'assistant', content: 'ignored' } },
    '{malformed-json',
  ].map(value => typeof value === 'string' ? value : value))

  // Replace the deliberately malformed row without asking writeTranscript to stringify it.
  const valid = readFileSync(path, 'utf8').replace('"{malformed-json"', '{malformed-json')
  writeFileSync(path, valid, { mode: 0o600 })
  assert.equal(await countUserPrompts(path), 5)
})

test('SessionEnd stays silent, reports only a count, and sends only later deltas', async t => {
  const f = fixture(t)
  const sessionId = 'session-one'
  const path = f.transcript(sessionId, [row('p1', '비밀 원문 1'), row('p2', '비밀 원문 2')])
  const input = { session_id: sessionId, transcript_path: path, hook_event_name: 'SessionEnd', reason: 'other' }

  f.run(input)
  const stateDir = join(f.cache, 'gpters-aitk', 'session-report')
  await waitFor(() => existsSync(f.reports) && existsSync(stateDir) && readdirSync(stateDir).some(name => name.endsWith('.json')), 'first report did not finish')
  assert.equal(readFileSync(f.reports, 'utf8').trim(), 'report-session --count 2 --version 0.1.24')
  assert.equal(readFileSync(f.reports, 'utf8').includes('비밀 원문'), false)
  assert.equal(readFileSync(f.reports, 'utf8').includes(path), false)
  assert.equal(readFileSync(f.reports, 'utf8').includes(sessionId), false)

  f.run(input)
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(readFileSync(f.reports, 'utf8').trim().split('\n').length, 1)

  writeTranscript(path, [row('p1', '비밀 원문 1'), row('p2', '비밀 원문 2'), row('p3', '비밀 원문 3')])
  f.run(input)
  await waitFor(() => readFileSync(f.reports, 'utf8').trim().split('\n').length === 2, 'delta report did not finish')
  assert.deepEqual(readFileSync(f.reports, 'utf8').trim().split('\n'), [
    'report-session --count 2 --version 0.1.24',
    'report-session --count 1 --version 0.1.24',
  ])
})

test('failed delivery is retried instead of being marked reported', async t => {
  const f = fixture(t)
  const sessionId = 'retry-session'
  const path = f.transcript(sessionId, [row('p1', 'retry me')])
  const input = { session_id: sessionId, transcript_path: path, hook_event_name: 'SessionEnd' }
  f.env.HOOK_TEST_EXIT = '1'
  f.run(input)
  await waitFor(() => existsSync(f.reports), 'failed attempt did not execute')
  f.env.HOOK_TEST_EXIT = '0'
  f.run(input)
  await waitFor(() => readFileSync(f.reports, 'utf8').trim().split('\n').length === 2, 'retry did not execute')
})

test('invalid, public, outside, and symlink transcripts fail closed and stay silent', async t => {
  const f = fixture(t)
  const outside = join(f.root, 'outside.jsonl')
  writeTranscript(outside, [row('p1', 'outside')])
  const publicPath = f.transcript('public-session', [row('p1', 'public')])
  chmodSync(publicPath, 0o644)
  const linkPath = join(f.projects, 'link-session.jsonl')
  symlinkSync(outside, linkPath)
  for (const input of [
    '', '{', 'null', '{}',
    { session_id: 'outside', transcript_path: outside, hook_event_name: 'SessionEnd' },
    { session_id: 'public-session', transcript_path: publicPath, hook_event_name: 'SessionEnd' },
    { session_id: 'link-session', transcript_path: linkPath, hook_event_name: 'SessionEnd' },
    { session_id: 'wrong-event', transcript_path: publicPath, hook_event_name: 'Stop' },
  ]) f.run(input)
  // The worker is detached, so give a leaked report enough time to surface before asserting.
  await new Promise(resolve => setTimeout(resolve, 1500))
  assert.equal(existsSync(f.reports), false)
})

test('agent mode does not invoke the personal session reporter', async t => {
  const f = fixture(t)
  const sessionId = 'agent-session'
  const path = f.transcript(sessionId, [row('p1', 'agent task')])
  mkdirSync(join(f.home, '.config', 'aitk'), { recursive: true })
  writeFileSync(join(f.home, '.config', 'aitk', 'agent.json'), '{}')
  f.run({ session_id: sessionId, transcript_path: path, hook_event_name: 'SessionEnd' })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(existsSync(f.reports), false)
})

test('manifest has no conversation-context hook and only reports at SessionEnd', () => {
  const manifest = JSON.parse(readFileSync(join(source, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.1.24')
  assert.equal(manifest.hooks.UserPromptSubmit, undefined)
  assert.equal(manifest.hooks.Stop, undefined)
  assert.equal(manifest.hooks.SessionEnd.length, 1)
  assert.equal(manifest.hooks.SessionEnd[0].hooks[0].command.includes('session-report.sh'), true)
  const startupCommands = manifest.hooks.SessionStart.flatMap(group => group.hooks.map(hook => hook.command))
  assert.equal(startupCommands.some(command => command.includes('toolkit-config.sh')), false)
  assert.equal(JSON.stringify(manifest.hooks).includes('team-skills'), false)
})
