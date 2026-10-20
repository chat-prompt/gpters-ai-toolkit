/** 자동 연결의 플랫폼 경계를 함수로 직접 확인한다. 실제 홈에는 닿지 않는다. (DEV-4570) */
import { afterEach, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runUsageAutoSetup } from '../../src/commands/usage-setup.js'

const homes: string[] = []
afterEach(() => { for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true }) })

it('Windows에서는 /bin/sh 래퍼가 원래 표시줄을 깰 수 있어 연결하지 않는다', () => {
  const home = mkdtempSync(join(tmpdir(), 'aitk-auto-win-'))
  homes.push(home)
  mkdirSync(join(home, '.claude'))
  writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ language: 'ko' }))
  expect(runUsageAutoSetup({ home, env: {}, platform: 'win32' })).toEqual({ status: 'skipped', reason: 'platform' })
  expect(JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf8'))).toEqual({ language: 'ko' })
})

it('서버로 보낼 결과 코드에는 사유 문구를 싣지 않고, Claude를 안 쓰는 머신·경합은 남기지 않는다', async () => {
  const { autoSetupResultCode } = await import('../../src/commands/usage-setup.js')
  expect(autoSetupResultCode({ status: 'connected', mode: 'wrapped' })).toBe('connected:wrapped')
  expect(autoSetupResultCode({ status: 'skipped', reason: 'symlink' })).toBe('skipped:symlink')
  expect(autoSetupResultCode({ status: 'failed', reason: '/Users/someone/.claude/settings.json: EACCES' })).toBe('failed')
  expect(autoSetupResultCode({ status: 'skipped', reason: 'no-claude' })).toBeNull()
  expect(autoSetupResultCode({ status: 'skipped', reason: 'busy' })).toBeNull()
})

it('보고에 싣는 연결 상태는 표시줄 종류·허용된 결과 코드·시각만 읽는다', async () => {
  const { readLimitCapture, recordAutoSetupResult } = await import('../../src/usage/claude-statusline.js')
  const home = mkdtempSync(join(tmpdir(), 'aitk-capture-'))
  homes.push(home)
  // Claude Code를 안 쓰는 머신은 상태를 보내지 않고(서버가 이전 값을 지킨다), ~/.claude도 만들지 않는다
  recordAutoSetupResult('skipped:agent', home)
  expect(existsSync(join(home, '.claude'))).toBe(false)
  expect(readLimitCapture(home, {})).toBeNull()
  // 기본 경로에 흔적이 없어도 별도 설정 폴더만 쓰는 머신은 그 사유를 보낸다
  mkdirSync(join(home, 'custom-claude'))
  expect(readLimitCapture(home, { CLAUDE_CONFIG_DIR: join(home, 'custom-claude') }))
    .toEqual({ statusline: 'none', autoSetup: 'skipped:config-dir', autoSetupAt: null, snapshotAt: null })
  expect(readLimitCapture(home, { CLAUDE_CONFIG_DIR: join(home, 'missing-claude') })).toBeNull()

  mkdirSync(join(home, '.claude/projects'), { recursive: true })
  expect(readLimitCapture(home, {})).toEqual({ statusline: 'none', autoSetup: null, autoSetupAt: null, snapshotAt: null })

  recordAutoSetupResult('skipped:symlink', home, Date.parse('2026-10-20T00:00:00Z'))
  writeFileSync(join(home, '.claude/aitk-usage/claude.json'), JSON.stringify({
    version: 1, source: 'claude-code-statusline', capturedAt: '2026-10-19T09:00:00.000Z', usedPercent: 30, resetsAt: '2026-10-23T00:00:00.000Z',
  }))
  expect(readLimitCapture(home, {})).toEqual({
    statusline: 'none', autoSetup: 'skipped:symlink', autoSetupAt: '2026-10-20T00:00:00.000Z', snapshotAt: '2026-10-19T09:00:00.000Z',
  })

  // 허용 목록 밖의 결과(손으로 고친 파일·사유 문구)는 보내지 않는다
  writeFileSync(join(home, '.claude/aitk-usage/auto-setup.json'), JSON.stringify({ version: 1, at: '2026-10-20T00:00:00Z', result: 'failed: /Users/someone/project' }))
  expect(readLimitCapture(home, {})).toMatchObject({ autoSetup: null, autoSetupAt: null })

  // 다른 설정 폴더를 쓰면 기본 경로의 연결·스냅샷을 지금 상태로 보내지 않는다
  expect(readLimitCapture(home, { CLAUDE_CONFIG_DIR: join(home, 'custom-claude') }))
    .toEqual({ statusline: 'none', autoSetup: 'skipped:config-dir', autoSetupAt: null, snapshotAt: null })

  // settings.json을 못 읽으면 "표시줄 없음"으로 오판하지 않고 상태를 모른다고 보낸다
  writeFileSync(join(home, '.claude/settings.json'), '{ broken')
  expect(readLimitCapture(home, {})).toBeNull()
})
