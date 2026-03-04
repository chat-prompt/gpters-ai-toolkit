/**
 * search 명령어 - 팀 스킬 검색
 */

import { apiCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'

/** search 명령어 옵션 */
export interface SearchOptions {
  /** 검색 쿼리 */
  query: string
  /** 아이템 타입 필터 */
  type?: string
  /** 결과 제한 수 */
  limit?: number
}

/**
 * search 명령어 실행
 *
 * @param opts - 검색 옵션
 */
export async function runSearch(opts: SearchOptions): Promise<void> {
  const token = resolveToken()
  const params: Record<string, unknown> = { query: opts.query }
  if (opts.type) params.category = opts.type
  if (opts.limit) params.limit = opts.limit

  const result = await apiCall('search', params, token)

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  const items = Array.isArray(result.data) ? result.data : []
  info(`${items.length}개 결과 발견`)
  jsonOut(items)
}
