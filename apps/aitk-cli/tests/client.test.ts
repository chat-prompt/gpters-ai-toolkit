/**
 * client 모듈 테스트 - API 호출 구성 및 에러 매핑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let apiCall: typeof import('../src/client.js').apiCall
let jsonRpcCall: typeof import('../src/client.js').jsonRpcCall

describe('client', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env

  beforeEach(async () => {
    process.env = { ...originalEnv }
    process.env.AITK_SERVER_URL = 'https://test.example.com'
    vi.resetModules()
    const mod = await import('../src/client.js')
    apiCall = mod.apiCall
    jsonRpcCall = mod.jsonRpcCall
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env = originalEnv
  })

  describe('apiCall', () => {
    it('올바른 URL과 헤더로 POST 요청', async () => {
      let capturedUrl = ''
      let capturedInit: RequestInit | undefined
      globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url as string
        capturedInit = init
        return new Response(JSON.stringify([{ id: 'test' }]), { status: 200 })
      }) as typeof fetch

      const result = await apiCall('search', { query: 'test' }, 'my-token')

      expect(capturedUrl).toBe('https://test.example.com/api/mcp?action=search')
      expect(capturedInit?.method).toBe('POST')
      expect((capturedInit?.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token')
      expect(result.ok).toBe(true)
      expect(result.data).toEqual([{ id: 'test' }])
    })

    it('401 에러 매핑', async () => {
      globalThis.fetch = vi.fn(async () => new Response('', { status: 401 })) as typeof fetch

      const result = await apiCall('search', { query: 'test' })
      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      expect(result.error).toContain('Auth required')
    })

    it('429 에러 매핑', async () => {
      globalThis.fetch = vi.fn(async () => new Response('', { status: 429 })) as typeof fetch

      const result = await apiCall('search', { query: 'test' })
      expect(result.ok).toBe(false)
      expect(result.status).toBe(429)
      expect(result.error).toContain('Rate limit')
    })

    it('네트워크 에러 처리', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('network error')
      }) as typeof fetch

      const result = await apiCall('search', { query: 'test' })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('network error')
    })
  })

  describe('jsonRpcCall', () => {
    it('JSON-RPC 2.0 형식으로 요청', async () => {
      let capturedBody = ''
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = init?.body as string
        return new Response(JSON.stringify({ result: { status: 'ok' } }), { status: 200 })
      }) as typeof fetch

      const result = await jsonRpcCall('tools/call', { name: 'check_updates', arguments: {} })

      const parsed = JSON.parse(capturedBody)
      expect(parsed.jsonrpc).toBe('2.0')
      expect(parsed.method).toBe('tools/call')
      expect(result.ok).toBe(true)
      expect(result.data).toEqual({ status: 'ok' })
    })

    it('JSON-RPC 에러 응답 처리', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'method not found' } }), { status: 200 })
      ) as typeof fetch

      const result = await jsonRpcCall('tools/call', { name: 'invalid' })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('method not found')
    })
  })
})
