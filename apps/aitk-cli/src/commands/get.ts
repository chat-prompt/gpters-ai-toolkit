/**
 * get 명령어 - 플러그인 상세 조회
 */

import { apiCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/**
 * get 명령어 실행
 *
 * @param pluginId - 조회할 플러그인 ID
 */
export async function runGet(pluginId: string): Promise<void> {
  const token = resolveToken()
  const result = await apiCall('get', { pluginId }, token)

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  jsonOut(result.data)
}
