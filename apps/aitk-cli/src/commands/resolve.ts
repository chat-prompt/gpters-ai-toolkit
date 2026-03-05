/**
 * resolve 명령어 - 개선 제안 수락/거부
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/** resolve 명령어 옵션 */
export interface ResolveOptions {
  /** 제안 ID */
  suggestionId: string
  /** 수락 또는 거부 */
  action: string
  /** 응답 코멘트 */
  comment?: string
}

/**
 * resolve 명령어 실행
 *
 * @param opts - 응답 옵션
 */
export async function runResolve(opts: ResolveOptions): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const args: Record<string, unknown> = {
    suggestionId: opts.suggestionId,
    action: opts.action,
  }
  if (opts.comment) args.comment = opts.comment

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'resolve_suggestion', arguments: args },
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
