/**
 * suggestions 명령어 - 개선 제안 목록 조회
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/** suggestions 명령어 옵션 */
export interface SuggestionsOptions {
  /** 특정 플러그인 ID 필터 */
  pluginId?: string
  /** 상태 필터 */
  status?: string
  /** 최대 결과 수 */
  limit?: number
}

/**
 * suggestions 명령어 실행
 *
 * @param opts - 조회 옵션
 */
export async function runSuggestions(opts: SuggestionsOptions): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const args: Record<string, unknown> = {}
  if (opts.pluginId) args.pluginId = opts.pluginId
  if (opts.status) args.status = opts.status
  if (opts.limit) args.limit = opts.limit

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'list_suggestions', arguments: args },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  const content = (result.data as { content?: { text: string }[] })?.content
  if (content?.[0]?.text) {
    jsonOut(JSON.parse(content[0].text))
  } else {
    jsonOut(result.data)
  }
}
