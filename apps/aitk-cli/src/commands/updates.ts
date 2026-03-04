/**
 * updates 명령어 - 설치된 스킬 업데이트 확인
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'

/**
 * updates 명령어 실행
 */
export async function runUpdates(): Promise<void> {
  const token = resolveToken()
  const result = await jsonRpcCall(
    'tools/call',
    { name: 'check_updates', arguments: {} },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  info('업데이트 확인 완료')
  jsonOut(result.data)
}
