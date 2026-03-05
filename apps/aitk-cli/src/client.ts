/**
 * API 클라이언트 - Simple REST 및 JSON-RPC 2.0 호출
 */

import { readConfig } from './config.js'

/** API 응답 결과 */
export interface ApiResult<T = unknown> {
  /** 성공 여부 */
  ok: boolean
  /** 응답 데이터 */
  data?: T
  /** 에러 메시지 */
  error?: string
  /** HTTP 상태 코드 */
  status?: number
}

/**
 * 서버 URL 결정
 *
 * @returns 설정된 서버 URL
 */
function getServerUrl(): string {
  return process.env.AITK_SERVER_URL ?? readConfig().serverUrl
}

/**
 * Simple REST API 호출 (POST /api/mcp?action=...)
 *
 * @param action - API 액션 (search, get, create 등)
 * @param params - 요청 파라미터
 * @param token - 인증 토큰
 * @returns API 응답 결과
 */
export async function apiCall<T = unknown>(
  action: string,
  params: Record<string, unknown>,
  token?: string
): Promise<ApiResult<T>> {
  const url = `${getServerUrl()}/api/mcp?action=${encodeURIComponent(action)}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30000),
    })

    if (response.status === 401) {
      return { ok: false, error: 'Auth required. Run "aitk login" first.', status: 401 }
    }
    if (response.status === 429) {
      return { ok: false, error: 'Rate limit exceeded. Please try again later.', status: 429 }
    }
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, status: response.status }
    }

    const data = (await response.json()) as T
    return { ok: true, data, status: response.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('TimeoutError') || message.includes('abort')) {
      return { ok: false, error: 'Request timeout (5s)' }
    }
    return { ok: false, error: message }
  }
}

/**
 * JSON-RPC 2.0 호출 (report-session, updates용)
 *
 * @param method - JSON-RPC 메서드명
 * @param params - 메서드 파라미터
 * @param token - 인증 토큰
 * @returns API 응답 결과
 */
export async function jsonRpcCall<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  token?: string
): Promise<ApiResult<T>> {
  const url = `${getServerUrl()}/api/mcp`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (response.status === 401) {
      return { ok: false, error: 'Auth required. Run "aitk login" first.', status: 401 }
    }
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, status: response.status }
    }

    const body = (await response.json()) as { result?: T; error?: { message: string } }
    if (body.error) {
      return { ok: false, error: body.error.message }
    }
    return { ok: true, data: body.result as T, status: response.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('TimeoutError') || message.includes('abort')) {
      return { ok: false, error: 'Request timeout (5s)' }
    }
    return { ok: false, error: message }
  }
}
