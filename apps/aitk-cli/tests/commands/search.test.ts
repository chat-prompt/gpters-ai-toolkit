/**
 * search 명령어 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('search command', () => {
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

  it('검색 결과를 stdout JSON으로 출력', async () => {
    const mockPlugins = [
      { id: 'code-reviewer', name: '코드 리뷰어', relevanceScore: 0.85 },
      { id: 'refactor-guide', name: '리팩토링 가이드', relevanceScore: 0.72 },
    ]

    // JSON-RPC tools/call 응답 구조
    const jsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{
          type: 'text',
          text: JSON.stringify({ plugins: mockPlugins, total: 2, query: '코드 리뷰', searchTime: 15 }),
        }],
      },
    }

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(jsonRpcResponse), { status: 200 })
    ) as typeof fetch

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    const originalStdoutWrite = process.stdout.write.bind(process.stdout)
    const originalStderrWrite = process.stderr.write.bind(process.stderr)

    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk)
      return true
    }) as typeof process.stdout.write

    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk)
      return true
    }) as typeof process.stderr.write

    try {
      const { runSearch } = await import('../../src/commands/search.js')
      await runSearch({ query: '코드 리뷰', limit: 3 })

      const stdout = stdoutChunks.join('')
      const parsed = JSON.parse(stdout)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].id).toBe('code-reviewer')

      const stderr = stderrChunks.join('')
      expect(stderr).toContain('2개 결과')
    } finally {
      process.stdout.write = originalStdoutWrite
      process.stderr.write = originalStderrWrite
    }
  })
})
