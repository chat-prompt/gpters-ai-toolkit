/**
 * Claude Code 로컬 트랜스크립트 사용량 수집기
 *
 * ~/.claude/projects 아래 세션 트랜스크립트에서 assistant 응답의 토큰만 합산한다.
 * 대화 내용·파일 경로는 읽되 어디에도 담지 않는다 — 나가는 건 집계 수치와 플랜 문자열뿐이다.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findJsonlFiles, scanJsonl, toCount } from './jsonl.js'
import type { UsageRecord, UsageWindow } from './types.js'

/** 토큰이 붙는 줄은 assistant 줄뿐이다 — 이 문자열이 없으면 파싱할 이유가 없다 */
const ASSISTANT_HINT = '"assistant"'

/** 트랜스크립트 한 줄에서 실제로 쓰는 부분 */
interface AssistantEntry {
  type?: unknown
  timestamp?: unknown
  sessionId?: unknown
  message?: {
    id?: unknown
    model?: unknown
    usage?: Record<string, unknown>
  }
}

/**
 * ~/.claude.json에서 요금제 티어 문자열을 읽는다
 *
 * @param home - 홈 디렉터리
 * @returns 티어 문자열. 파일이 없거나 로그인 전이면 null
 */
function readPlanRaw(home: string): string | null {
  try {
    const config = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf-8')) as {
      oauthAccount?: { organizationRateLimitTier?: unknown }
    }
    const tier = config.oauthAccount?.organizationRateLimitTier
    return typeof tier === 'string' && tier.length > 0 ? tier : null
  } catch {
    return null
  }
}

/**
 * 티어 문자열을 사람이 읽는 플랜명으로 바꾼다
 *
 * 티어 종류를 표로 박아 두면 새 티어가 나올 때 조용히 틀린다. 관측된 티어가
 * `default_claude_max_20x` 꼴이므로 접두사만 떼고 단어를 세워 대시보드가 쓰는
 * `Claude Max 20x` 표기를 규칙으로 만든다.
 *
 * @param planRaw - 원시 티어 문자열
 * @returns 사람이 읽는 플랜명. 입력이 없으면 null
 */
export function toClaudePlanName(planRaw: string | null): string | null {
  if (!planRaw) return null
  const words = planRaw.replace(/^default_/, '').split('_').filter(Boolean)
  if (words.length === 0) return null
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * 집계 구간 안의 Claude Code 사용량을 모은다
 *
 * @param window - 집계 구간
 * @returns 집계 레코드. 구간 안에 응답이 하나도 없으면 null
 */
export async function collectClaudeCode(window: UsageWindow): Promise<UsageRecord | null> {
  const home = homedir()
  const files = await findJsonlFiles(join(home, '.claude', 'projects'), window.start)
  if (files.length === 0) return null

  const startMs = window.start.getTime()
  const endMs = window.end.getTime()

  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  const models: Record<string, number> = {}
  const sessions = new Set<string>()
  // 컴팩션이 같은 응답을 여러 트랜스크립트에 복제한다. message.id로 걸러야 총량이 부풀지 않는다.
  const seenMessages = new Set<string>()

  for (const file of files) {
    await scanJsonl(
      file,
      (line) => line.includes(ASSISTANT_HINT),
      (raw) => {
        const entry = raw as AssistantEntry
        if (entry.type !== 'assistant') return

        const at = Date.parse(String(entry.timestamp))
        if (!Number.isFinite(at) || at < startMs || at > endMs) return

        const message = entry.message
        const messageId = message?.id
        if (typeof messageId !== 'string' || seenMessages.has(messageId)) return
        seenMessages.add(messageId)

        const usage = message?.usage ?? {}
        // 캐시 생성분은 실제로 새로 읽힌 입력이라 입력 쪽에, 캐시 적중분만 캐시로 센다.
        const input = toCount(usage.input_tokens) + toCount(usage.cache_creation_input_tokens)
        const cached = toCount(usage.cache_read_input_tokens)
        const output = toCount(usage.output_tokens)

        inputTokens += input
        cachedTokens += cached
        outputTokens += output

        if (typeof entry.sessionId === 'string') sessions.add(entry.sessionId)

        // 토큰을 하나도 안 쓴 응답(<synthetic> 등)까지 모델별 집계에 넣으면
        // 계약의 모델 종류 상한만 갉아먹고 대시보드에는 0짜리 줄이 늘어난다.
        const total = input + cached + output
        if (total === 0) return

        const model = typeof message?.model === 'string' ? message.model : 'unknown'
        models[model] = (models[model] ?? 0) + total
      }
    )
  }

  if (seenMessages.size === 0) return null

  const planRaw = readPlanRaw(home)
  return {
    client: 'claude-code',
    planRaw,
    plan: toClaudePlanName(planRaw),
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    inputTokens,
    outputTokens,
    cachedTokens,
    sessions: sessions.size,
    models,
    // Claude Code는 남은 한도를 로컬에 남기지 않는다. 0으로 채우면 "한도를 안 쓴 사람"과
    // 구분되지 않으므로 null로 보낸다.
    limitUsedPercent: null,
    limitResetsAt: null,
  }
}
