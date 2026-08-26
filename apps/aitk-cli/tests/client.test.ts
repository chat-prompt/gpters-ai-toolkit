/**
 * client 모듈 테스트 - API 호출 구성 및 에러 매핑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let apiCall: typeof import('../src/client.js').apiCall
let jsonRpcCall: typeof import('../src/client.js').jsonRpcCall
let jsonRpcSessionCall: typeof import('../src/client.js').jsonRpcSessionCall

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
    jsonRpcSessionCall = mod.jsonRpcSessionCall
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

    it('400 응답 시 서버 에러 메시지 노출 (deploy 중첩 형태)', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            data: { success: false, error: '업데이트 시 changelog는 필수입니다.' },
          }),
          { status: 400 }
        )
      ) as typeof fetch

      const result = await apiCall('deploy', { id: 'x' }, 'tok')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(400)
      expect(result.error).toBe('업데이트 시 changelog는 필수입니다.')
    })

    it('400 응답 시 서버 에러 메시지 노출 (최상위 error)', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: 'Unknown action: foo' }), {
          status: 400,
        })
      ) as typeof fetch

      const result = await apiCall('foo', {}, 'tok')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('Unknown action: foo')
    })

    it('JSON이 아닌 에러 본문은 HTTP status로 fallback', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response('<html>502 Bad Gateway</html>', { status: 502 })
      ) as typeof fetch

      const result = await apiCall('search', {}, 'tok')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('HTTP 502')
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

  describe('jsonRpcSessionCall', () => {
    it('initialize에서 받은 세션 ID를 실제 도구 호출에 전달한다', async () => {
      const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = []
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>
        const headers = init?.headers as Record<string, string>
        requests.push({ body, headers })
        if (body.method === 'initialize') {
          return new Response(JSON.stringify({ result: { protocolVersion: '2025-03-26' } }), {
            status: 200,
            headers: { 'Mcp-Session-Id': 'mcp_test_session' },
          })
        }
        return new Response(JSON.stringify({ result: { status: 'recorded' } }), { status: 200 })
      }) as typeof fetch

      const result = await jsonRpcSessionCall(
        'tools/call',
        { name: 'report_skill_execution', arguments: {} },
        'local-token',
        { name: 'test-agent', version: '1.0.0' }
      )

      expect(requests).toHaveLength(2)
      expect(requests[0].body.method).toBe('initialize')
      expect(requests[1].headers['Mcp-Session-Id']).toBe('mcp_test_session')
      expect(requests[1].headers.Authorization).toBe('Bearer local-token')
      expect(result).toEqual({ ok: true, data: { status: 'recorded' }, status: 200 })
    })

    it('initialize 응답에 세션 ID가 없으면 보고하지 않는다', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ result: {} }), { status: 200 })
      ) as typeof fetch

      const result = await jsonRpcSessionCall('tools/call', { name: 'report_skill_execution' })

      expect(result.ok).toBe(false)
      expect(result.error).toContain('session ID')
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })
  })
})
