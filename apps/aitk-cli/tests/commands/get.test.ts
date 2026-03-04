/**
 * get 명령어 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('get command', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.AITK_SERVER_URL = 'https://test.example.com'
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('플러그인 상세를 stdout JSON으로 출력', async () => {
    const mockPlugin = {
      id: 'code-reviewer',
      name: '코드 리뷰어',
      content: '# Code Reviewer\n...',
    }

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(mockPlugin), { status: 200 })
    ) as typeof fetch

    const stdoutChunks: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk)
      return true
    }) as typeof process.stdout.write

    try {
      const { runGet } = await import('../../src/commands/get.js')
      await runGet('code-reviewer')

      const parsed = JSON.parse(stdoutChunks.join(''))
      expect(parsed.id).toBe('code-reviewer')
      expect(parsed.content).toContain('Code Reviewer')
    } finally {
      process.stdout.write = originalWrite
    }
  })

  it('401 에러 시 exit code 2로 종료', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 401 })) as typeof fetch

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)

    try {
      const { runGet } = await import('../../src/commands/get.js')
      await runGet('nonexistent')
    } catch {
      // expected
    }

    expect(mockExit).toHaveBeenCalledWith(2)
    mockExit.mockRestore()
  })
})
