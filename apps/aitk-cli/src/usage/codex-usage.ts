import { toCount } from './jsonl.js'

/** Stable cumulative usage identity. Never sum this snapshot. */
export function cumulativeUsageIdentity(payload: { info?: unknown }): string | null {
  const info = payload.info
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null
  const raw = (info as Record<string, unknown>).total_token_usage
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const usage = raw as Record<string, unknown>
  if (!['input_tokens', 'output_tokens', 'total_tokens'].some(key =>
    typeof usage[key] === 'number' && Number.isFinite(usage[key]) && (usage[key] as number) >= 0
  )) return null
  return JSON.stringify({
    inputTokens: toCount(usage.input_tokens),
    outputTokens: toCount(usage.output_tokens),
    cacheCreationInputTokens: toCount(usage.cache_write_input_tokens),
    cacheReadInputTokens: toCount(usage.cached_input_tokens),
    thinkingTokens: toCount(usage.reasoning_output_tokens),
    totalTokens: toCount(usage.total_tokens),
  })
}
