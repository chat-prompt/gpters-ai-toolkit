/**
 * suggest 명령어 - 다른 사람의 플러그인에 개선 제안
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/** suggest 명령어 옵션 */
export interface SuggestOptions {
  /** 대상 플러그인 ID */
  pluginId: string
  /** 제안 제목 */
  title: string
  /** 상세 설명 */
  description: string
  /** 변경된 코드/내용 */
  diff?: string
}

/**
 * suggest 명령어 실행
 *
 * @param opts - 제안 옵션
 */
export async function runSuggest(opts: SuggestOptions): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const args: Record<string, unknown> = {
    pluginId: opts.pluginId,
    title: opts.title,
    description: opts.description,
  }
  if (opts.diff) args.diff = opts.diff

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'suggest_improvement', arguments: args },
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
