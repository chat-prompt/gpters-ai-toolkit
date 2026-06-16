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
 * 실패한 응답 본문에서 서버가 제공한 에러 메시지를 추출
 *
 * 서버는 deploy 등에서 `{ success: false, data: { error } }` 또는
 * `{ success: false, error }` 형태로 구체적인 사유(예: "업데이트 시 changelog는
 * 필수입니다")를 내려준다. 이를 버리지 않고 사용자에게 그대로 전달한다.
 *
 * @param response - 실패한 fetch 응답
 * @returns 추출된 에러 메시지, 없거나 파싱 불가 시 undefined
 */
async function readServerError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as Record<string, unknown>
    const nested = body?.data as Record<string, unknown> | undefined
    const candidates = [nested?.error, body?.error, nested?.message, body?.message]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
    }
  } catch {
    // 본문이 JSON이 아니거나 비어있음 — 호출부에서 HTTP status로 fallback
  }
  return undefined
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
      const serverError = await readServerError(response)
      return {
        ok: false,
        error: serverError ?? `HTTP ${response.status}`,
        status: response.status,
      }
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
