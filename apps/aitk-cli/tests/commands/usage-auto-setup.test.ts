/** 자동 연결의 플랫폼 경계를 함수로 직접 확인한다. 실제 홈에는 닿지 않는다. (DEV-4570) */
import { afterEach, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
