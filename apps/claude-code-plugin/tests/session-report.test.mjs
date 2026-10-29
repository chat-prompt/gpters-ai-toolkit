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
import { execFileSync, spawnSync } from 'node:child_process'
import { countUserPrompts } from '../scripts/session-report.mjs'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginVersion = JSON.parse(readFileSync(join(source, '.claude-plugin', 'plugin.json'), 'utf8')).version

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
  // 백그라운드 보고가 끝나길 최대 10초 기다린다. 2초는 다른 테스트와 같이 돌 때 모자라 가끔 실패했다
  for (let attempt = 0; attempt < 1000; attempt++) {
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
  assert.equal(readFileSync(f.reports, 'utf8').trim(), `report-session --count 2 --version ${pluginVersion}`)
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
    `report-session --count 2 --version ${pluginVersion}`,
    `report-session --count 1 --version ${pluginVersion}`,
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

test('manifest registers the skill hint and gate, and reports at SessionEnd', () => {
  const manifest = JSON.parse(readFileSync(join(source, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.match(manifest.version, /^0\.1\.\d+$/)
  assert.equal(manifest.hooks.UserPromptSubmit.length, 1)
  assert.equal(manifest.hooks.UserPromptSubmit[0].hooks[0].command.includes('skill-search.sh'), true)
  assert.equal(manifest.hooks.UserPromptSubmit[0].hooks[1].command.includes('skill-gate.sh'), true)
  assert.equal(manifest.hooks.SessionStart.some(group => group.matcher === 'clear' && group.hooks[0].command.includes('skill-gate.sh')), true)
  assert.equal(manifest.hooks.PreToolUse[0].hooks[0].command.includes('skill-gate.sh'), true)
  assert.equal(manifest.hooks.Stop, undefined)
  assert.equal(manifest.hooks.SessionEnd.length, 1)
  assert.equal(manifest.hooks.SessionEnd[0].hooks[0].command.includes('session-report.sh'), true)
  const startupCommands = manifest.hooks.SessionStart.flatMap(group => group.hooks.map(hook => hook.command))
  assert.equal(startupCommands.some(command => command.includes('toolkit-config.sh')), false)
  assert.equal(JSON.stringify(manifest.hooks).includes('team-skills'), false)
})

test('skill hint is printed by default and silenced by AITK_SKILL_HINT=0', t => {
  const home = mkdtempSync(join(tmpdir(), 'skill-hint-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const script = join(source, 'scripts', 'skill-search.sh')
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'aitk'), '#!/bin/sh\n')
  chmodSync(join(bin, 'aitk'), 0o755)
  const env = { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` }
  delete env.AITK_SKILL_HINT
  const on = execFileSync('bash', [script], { env, encoding: 'utf8' })
  assert.match(on, /<team-skills>[\s\S]*aitk search/)
  const off = execFileSync('bash', [script], { env: { ...env, AITK_SKILL_HINT: '0' }, encoding: 'utf8' })
  assert.equal(off, '')
  // aitk가 없으면 MCP 검색으로 안내한다
  const noCli = execFileSync('bash', [script], { env: { ...env, PATH: '/usr/bin:/bin' }, encoding: 'utf8' })
  assert.match(noCli, /semantic_search/)
  assert.doesNotMatch(noCli, /Bash\("aitk search/)
})

test('skill gate forces a search first, then asks new-or-same once per message', t => {
  const root = mkdtempSync(join(tmpdir(), 'skill-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'aitk'), '#!/bin/sh\n')
  chmodSync(join(bin, 'aitk'), 0o755)
  const script = join(source, 'scripts', 'skill-gate.sh')
  // HOME을 임시 폴더로 둬서 개발자 머신의 agent.json, 셸의 끄기 변수에 결과가 흔들리지 않게 한다
  const env = { ...process.env, HOME: root, TMPDIR: root, PATH: `${bin}:${process.env.PATH}` }
  delete env.AITK_SKILL_GATE
  delete env.AITK_SKILL_HINT
  const run = (event, extra = {}, extraEnv = {}) =>
    spawnSync('bash', [script], {
      env: { ...env, ...extraEnv },
      input: JSON.stringify({ session_id: 's1', hook_event_name: event, ...extra }),
      encoding: 'utf8',
    })
  const tool = command => run('PreToolUse', { tool_name: 'Bash', tool_input: { command } })

  // 첫 메시지: 검색해야만 통과한다
  assert.equal(run('UserPromptSubmit', { prompt: 'PR 코드 리뷰 해줘' }).stdout, '')
  const first = tool('ls')
  assert.equal(first.status, 2)
  assert.match(first.stderr, /aitk search/)
  assert.equal(tool('echo aitk:same-task').status, 2)
  assert.equal(tool("aitk search '코드 리뷰 code review'").status, 0)
  assert.equal(tool('ls').status, 0)

  // 다음 메시지: 같은 작업이라고 답하면 통과하고, 그 메시지 동안은 다시 막지 않는다
  run('UserPromptSubmit', { prompt: '이번에는 블로그 글 초안 써줘' })
  const judge = tool('ls')
  assert.equal(judge.status, 2)
  assert.match(judge.stderr, /aitk:same-task/)
  assert.equal(tool('echo aitk:same-task').status, 0)
  assert.equal(tool('ls').status, 0)

  // 뻔한 후속은 막지 않는다
  run('UserPromptSubmit', { prompt: '좋아, 그대로 계속 진행해줘' })
  assert.equal(tool('ls').status, 0)
  run('UserPromptSubmit', { prompt: 'sure' })
  assert.equal(tool('ls').status, 0)

  // 짧아도 새 요청이면 묻는다
  run('UserPromptSubmit', { prompt: 'PR 설명 써줘' })
  assert.equal(tool('ls').status, 2)
  tool('echo aitk:same-task')

  // 파일 내용에 검색 명령이 적혀 있을 뿐이면 검색으로 치지 않고, MCP 검색 도구는 검색으로 친다
  run('UserPromptSubmit', { prompt: '스킬 안내 문서 고쳐줘' })
  assert.equal(run('PreToolUse', { tool_name: 'Edit', tool_input: { new_string: "aitk search 'x'" } }).status, 2)
  assert.equal(run('PreToolUse', { tool_name: 'mcp__gpters-ai-toolkit__semantic_search', tool_input: { query: 'x' } }).status, 0)
  // 따옴표가 든 짧은 답도 프롬프트를 끝까지 읽는다
  run('UserPromptSubmit', { prompt: 'ok "그대로"' })
  assert.equal(tool('ls').status, 2)
  tool('echo aitk:same-task')

  // 짧은 답으로 시작할 뿐인 새 요청도 묻는다
  for (const prompt of ['next.js 대시보드 만들어줘', '네이버 뉴스 검색해줘', 'youtube 영상 요약해줘', '확인 메일 템플릿 만들어줘']) {
    run('UserPromptSubmit', { prompt })
    assert.equal(tool('ls').status, 2, prompt)
    tool('echo aitk:same-task')
  }
  // 메시지 전체가 짧은 답이면 막지 않는다. 로케일이 C여도 한글을 글자로 센다
  for (const prompt of ['네', 'ok!', '확인해줘', '그래']) {
    run('UserPromptSubmit', { prompt }, { LC_ALL: 'C' })
    assert.equal(tool('ls').status, 0, prompt)
  }

  // 30분 넘게 쉬면 첫 메시지처럼 검색을 요구한다
  execFileSync('touch', ['-t', '200001010000', join(root, 'aitk-skill-gate', 's1.last')])
  run('UserPromptSubmit', { prompt: '슬랙 봇 기능 추가해줘' })
  assert.equal(tool('echo aitk:same-task').status, 2)

  // /clear 뒤에도 마찬가지다
  run('SessionStart')
  run('UserPromptSubmit', { prompt: '좋아, 그대로 계속 진행해줘' })
  assert.equal(tool('ls').status, 2)

  assert.equal(run('PreToolUse', { tool_name: 'Read' }, { AITK_SKILL_GATE: '0' }).status, 0)
  // 쪽지를 끈 세션과 에이전트 머신에서도 막지 않는다
  assert.equal(run('PreToolUse', { tool_name: 'Read' }, { AITK_SKILL_HINT: '0' }).status, 0)
  mkdirSync(join(root, '.config', 'aitk'), { recursive: true })
  writeFileSync(join(root, '.config', 'aitk', 'agent.json'), '{}')
  assert.equal(tool('ls').status, 0)
})
