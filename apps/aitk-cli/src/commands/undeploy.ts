/**
 * undeploy 명령어 - 본인이 배포한 스킬/에이전트/커맨드 삭제
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/**
 * undeploy 명령어 실행
 *
 * @param id - 삭제할 플러그인 ID
 */
export async function runUndeploy(id: string): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'undeploy_skill', arguments: { id } },
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
