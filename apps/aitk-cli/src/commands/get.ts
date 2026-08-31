/**
 * get 명령어 - 플러그인 상세 조회
 */

import { apiCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error, extractObject } from '../output.js'
import { rememberLoadJourney, resolveJourneyForLoad } from '../journey.js'

export interface GetOptions {
  journeyId?: string
}

/**
 * get 명령어 실행
 *
 * @param pluginId - 조회할 플러그인 ID
 */
export async function runGet(pluginId: string, opts: GetOptions = {}): Promise<void> {
  const token = resolveToken()
  const journeyId = await resolveJourneyForLoad(pluginId, opts.journeyId)
  const result = await apiCall('get', { pluginId, _journeyId: journeyId }, token)

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  const extracted = extractObject(result.data)
  if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
    const { journeyId: returnedJourneyId, ...publicResult } = extracted as Record<string, unknown>
    await rememberLoadJourney(
      typeof returnedJourneyId === 'string' ? returnedJourneyId : journeyId,
      pluginId
    )
    jsonOut(publicResult)
    return
  }
  jsonOut(extracted)
}
