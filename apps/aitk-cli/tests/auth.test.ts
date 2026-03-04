/**
 * auth 모듈 테스트 - 토큰 우선순위 및 Claude 자격증명 파싱
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 테스트 전 모듈 mock을 위해 동적 import
let resolveToken: typeof import('../src/auth.js').resolveToken
let findClaudeCredentialToken: typeof import('../src/auth.js').findClaudeCredentialToken

describe('auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.GPTERS_TOKEN
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('findClaudeCredentialToken', () => {
    let tmpDir: string

    beforeEach(async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'aitk-auth-'))
      // homedir mock
      vi.doMock('node:os', () => ({
        homedir: () => tmpDir,
      }))
      const mod = await import('../src/auth.js')
      findClaudeCredentialToken = mod.findClaudeCredentialToken
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('자격증명 파일 없으면 undefined 반환', () => {
      expect(findClaudeCredentialToken()).toBeUndefined()
    })

    it('mcpOAuth에서 gpters-ai-toolkit 토큰 탐색', () => {
      const claudeDir = join(tmpDir, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      writeFileSync(
        join(claudeDir, '.credentials.json'),
        JSON.stringify({
          mcpOAuth: {
            'plugin:gpters-ai-toolkit:https://ai-toolkit.gpters.org': {
              accessToken: 'test-token-123',
            },
          },
        })
      )

      expect(findClaudeCredentialToken()).toBe('test-token-123')
    })

    it('빈 accessToken이면 undefined 반환', () => {
      const claudeDir = join(tmpDir, '.claude')
      mkdirSync(claudeDir, { recursive: true })
      writeFileSync(
        join(claudeDir, '.credentials.json'),
        JSON.stringify({
          mcpOAuth: {
            'plugin:gpters-ai-toolkit:url': {
              accessToken: '',
            },
          },
        })
      )

      expect(findClaudeCredentialToken()).toBeUndefined()
    })
  })

  describe('resolveToken', () => {
    let tmpDir: string

    beforeEach(async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'aitk-resolve-'))
      vi.doMock('node:os', () => ({
        homedir: () => tmpDir,
      }))
      const mod = await import('../src/auth.js')
      resolveToken = mod.resolveToken
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('GPTERS_TOKEN 환경변수 최우선', () => {
      process.env.GPTERS_TOKEN = 'env-token'
      expect(resolveToken()).toBe('env-token')
    })

    it('설정 파일 토큰 사용 (환경변수 없을 때)', () => {
      const configDir = join(tmpDir, '.config', 'aitk')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify({ token: 'config-token', serverUrl: 'https://example.com' })
      )

      expect(resolveToken()).toBe('config-token')
    })

    it('모든 소스 없으면 undefined', () => {
      expect(resolveToken()).toBeUndefined()
    })
  })
})
