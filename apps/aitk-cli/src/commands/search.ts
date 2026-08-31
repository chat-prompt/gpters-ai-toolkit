/**
 * search 명령어 - 팀 스킬 시맨틱 검색
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'
import { createJourneyId, rememberSearchJourney } from '../journey.js'

/** search 명령어 옵션 */
export interface SearchOptions {
  /** 검색 쿼리 */
  query: string
  /** 아이템 타입 필터 */
  type?: string
  /** 결과 제한 수 */
  limit?: number
  /** 작업 맥락 (검색 정확도 향상용) */
  context?: string
}

/** semantic_search JSON-RPC 응답 구조 */
interface ToolCallResult {
  /** MCP content 배열 */
  content?: Array<{ type: string; text: string }>
  /** 에러 여부 */
  isError?: boolean
}

/**
 * search 명령어 실행 (semantic_search via JSON-RPC)
 *
 * @param opts - 검색 옵션
 */
export async function runSearch(opts: SearchOptions): Promise<void> {
  const token = resolveToken()
  const journeyId = createJourneyId()
  const args: Record<string, unknown> = {
    query: opts.query,
    _source: 'aitk-cli',
    _journeyId: journeyId,
  }
  if (opts.type) args.category = opts.type
  if (opts.limit) args.limit = opts.limit
  if (opts.context) args.userContext = opts.context

  const result = await jsonRpcCall<ToolCallResult>('tools/call', {
    name: 'semantic_search',
    arguments: args,
  }, token)

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  // JSON-RPC tools/call 응답: { content: [{ type: "text", text: JSON.stringify({plugins, total, ...}) }] }
  const toolResult = result.data
  if (toolResult?.isError) {
    const errText = toolResult.content?.[0]?.text ?? 'Search failed'
    error(errText)
  }

  const textContent = toolResult?.content?.[0]?.text
  if (!textContent) {
    info('No results found')
    jsonOut([])
    return
  }

  const parsed = JSON.parse(textContent) as {
    plugins?: Array<{ id?: unknown }>
    total?: number
    journeyId?: string
  }
  const items = parsed.plugins ?? []
  const returnedJourneyId = parsed.journeyId ?? journeyId
  await rememberSearchJourney(
    returnedJourneyId,
    items.flatMap((item) => typeof item.id === 'string' ? [item.id] : [])
  )
  info(`${items.length} results found`)
  jsonOut(items)
}
