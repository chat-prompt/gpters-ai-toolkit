/**
 * hooks.json 병합 테스트
 *
 * 이 파일은 사용자가 다른 도구의 훅을 넣어 쓰는 공용 파일이다.
 * 여기서 가장 중요한 단언은 "우리 훅이 추가된다"가 아니라
 * **"남의 훅이 그대로 남는다"** 이다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureUsageHook, hasUsageHook, mergeUsageHook, USAGE_HOOK_MARKER } from '../src/hooks-json.js'

const SCRIPT = '/Users/someone/.agents/gpters-usage-report.sh'

/** 사용자가 이미 쓰고 있는 다른 도구의 훅 */
const FOREIGN = {
  hooks: {
    PostToolUse: [
      { hooks: [{ type: 'command', command: '"/opt/homebrew/bin/node" "/Applications/Other.app/hook.js"', timeout: 30 }] },
    ],
    SessionStart: [
      { hooks: [{ type: 'command', command: 'curl -s http://localhost:3778/hook', timeout: 5 }] },
    ],
  },
}

let dir: string
let hooksPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codex-hooks-'))
  hooksPath = join(dir, 'hooks.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ensureUsageHook', () => {
  it('파일이 없으면 새로 만들고 훅을 넣는다', () => {
    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('added')

    const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(hasUsageHook(parsed)).toBe(true)
  })

  it('남의 훅을 하나도 잃지 않는다', () => {
    writeFileSync(hooksPath, JSON.stringify(FOREIGN, null, 2))

    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('added')
    const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8'))

    // 다른 이벤트는 손대지 않는다
    expect(parsed.hooks.PostToolUse).toEqual(FOREIGN.hooks.PostToolUse)
    // 같은 이벤트에 있던 남의 그룹도 그대로 남는다
    expect(parsed.hooks.SessionStart[0]).toEqual(FOREIGN.hooks.SessionStart[0])
    // 우리 것은 뒤에 붙는다
    expect(parsed.hooks.SessionStart).toHaveLength(2)
    expect(parsed.hooks.SessionStart[1].hooks[0].command).toContain(USAGE_HOOK_MARKER)
  })

  it('두 번 돌려도 훅이 중복되지 않는다', () => {
    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('added')
    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('skipped')

    const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(parsed.hooks.SessionStart).toHaveLength(1)
  })

  it('설치 경로가 달라져도 이미 있는 것으로 본다', () => {
    // 마커로 판별하므로 경로가 바뀌어도 중복 등록하지 않는다
    ensureUsageHook(hooksPath, SCRIPT)
    expect(ensureUsageHook(hooksPath, '/전혀/다른/경로/gpters-usage-report.sh')).toBe('skipped')
  })

  it('깨진 JSON은 건드리지 않고 failed를 돌려준다', () => {
    // 남이 쓰던 파일을 새로 써버리면 그 사람의 훅이 통째로 사라진다
    const broken = '{ "hooks": { 깨짐'
    writeFileSync(hooksPath, broken)

    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('failed')
    expect(readFileSync(hooksPath, 'utf-8')).toBe(broken)
  })

  it('JSON이지만 객체가 아니면 건드리지 않는다', () => {
    writeFileSync(hooksPath, '[1,2,3]')

    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('failed')
    expect(readFileSync(hooksPath, 'utf-8')).toBe('[1,2,3]')
  })

  it('빈 파일은 정상으로 보고 새로 채운다', () => {
    writeFileSync(hooksPath, '')

    expect(ensureUsageHook(hooksPath, SCRIPT)).toBe('added')
    expect(hasUsageHook(JSON.parse(readFileSync(hooksPath, 'utf-8')))).toBe(true)
  })

  it('쓸 수 없는 경로면 failed를 돌려준다', () => {
    const bad = join(dir, 'nope', '\0invalid', 'hooks.json')
    expect(ensureUsageHook(bad, SCRIPT)).toBe('failed')
    expect(existsSync(bad)).toBe(false)
  })
})

describe('mergeUsageHook', () => {
  it('원본 객체를 변경하지 않는다', () => {
    const original = JSON.parse(JSON.stringify(FOREIGN))
    const merged = mergeUsageHook(original, SCRIPT)

    expect(original).toEqual(FOREIGN)
    expect(merged).not.toBe(original)
  })

  it('hooks 밖의 최상위 키를 보존한다', () => {
    const withExtra = { version: 2, hooks: {}, custom: { a: 1 } }
    const merged = mergeUsageHook(withExtra, SCRIPT)

    expect(merged.version).toBe(2)
    expect(merged.custom).toEqual({ a: 1 })
  })
})
