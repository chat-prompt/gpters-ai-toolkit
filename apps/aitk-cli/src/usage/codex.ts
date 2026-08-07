/**
 * Codex 로컬 롤아웃 사용량 수집기
 *
 * ~/.codex/sessions 아래 rollout-*.jsonl에서 토큰 집계와 한도를 읽는다.
 * Claude Code와 달리 Codex는 남은 주간 한도를 롤아웃에 남기므로 그 값을 함께 보고한다.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findJsonlFiles, scanJsonl, toCount } from './jsonl.js'
import type { UsageRecord, UsageWindow } from './types.js'

/** 토큰 집계 줄과 모델 지정 줄만 파싱한다 */
const TOKEN_HINT = '"token_count"'
const THREAD_SETTINGS_HINT = '"thread_settings"'
const TURN_CONTEXT_HINT = '"turn_context"'

/** 롤아웃 한 줄에서 실제로 쓰는 부분 */
interface RolloutEntry {
  /** 이 파일의 시각 키는 `ts`가 아니라 `timestamp`다 */
  timestamp?: unknown
  type?: unknown
  payload?: {
    type?: unknown
    /** turn_context 줄은 모델을 payload 바로 아래에 둔다 */
    model?: unknown
    thread_settings?: { model?: unknown }
    info?: {
      last_token_usage?: Record<string, unknown>
    }
    rate_limits?: {
      primary?: { used_percent?: unknown; resets_at?: unknown } | null
    }
  }
}

/**
 * ~/.codex/auth.json에서 ChatGPT 플랜 코드만 꺼낸다
 *
 * id_token은 그 자체가 OpenAI 계정 자격증명이다. 로컬에서 payload만 디코딩해
 * 플랜 문자열 하나를 뽑고, 토큰 원문은 반환값에도 로그에도 남기지 않는다.
 *
 * @param home - 홈 디렉터리
 * @returns 플랜 코드(예: prolite). 없거나 읽지 못하면 null
 */
function readPlanRaw(home: string): string | null {
  try {
    const auth = JSON.parse(readFileSync(join(home, '.codex', 'auth.json'), 'utf-8')) as {
      tokens?: { id_token?: unknown }
    }
    const idToken = auth.tokens?.id_token
    if (typeof idToken !== 'string') return null

    const payload = idToken.split('.')[1]
    if (!payload) return null

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >
    const authClaim = claims['https://api.openai.com/auth'] as
      | { chatgpt_plan_type?: unknown }
      | undefined
    const plan = authClaim?.chatgpt_plan_type
    return typeof plan === 'string' && plan.length > 0 ? plan : null
  } catch {
    return null
  }
}

/**
 * 플랜 코드에 대응하는 대시보드 표기
 *
 * `prolite`처럼 단어 경계가 없는 코드는 규칙으로 풀 수 없어 관측된 값만 표에 둔다.
 * 모르는 코드는 지어내지 않고 원문을 그대로 남긴다.
 */
const CHATGPT_PLAN_NAMES: Record<string, string> = {
  prolite: 'ChatGPT Pro (lite)',
}

/**
 * 플랜 코드를 사람이 읽는 플랜명으로 바꾼다
 *
 * @param planRaw - 원시 플랜 코드
 * @returns 사람이 읽는 플랜명. 입력이 없으면 null
 */
export function toCodexPlanName(planRaw: string | null): string | null {
  if (!planRaw) return null
  return CHATGPT_PLAN_NAMES[planRaw] ?? planRaw
}

/**
 * 집계 구간 안의 Codex 사용량을 모은다
 *
 * @param window - 집계 구간
 * @returns 집계 레코드. 구간 안에 토큰 집계 줄이 없으면 null
 */
export async function collectCodex(window: UsageWindow): Promise<UsageRecord | null> {
  const home = homedir()
  const files = await findJsonlFiles(join(home, '.codex', 'sessions'), window.start, (name) =>
    name.startsWith('rollout-')
  )
  if (files.length === 0) return null

  const startMs = window.start.getTime()
  const endMs = window.end.getTime()

  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  let counted = 0
  const models: Record<string, number> = {}
  const sessions = new Set<string>()

  // 한도는 누적이 아니라 그 시점의 스냅샷이라 가장 최근 값 하나만 의미가 있다.
  let limitAt = Number.NEGATIVE_INFINITY
  let limitUsedPercent: number | null = null
  let limitResetsAt: string | null = null

  for (const file of files) {
    // 모델명은 토큰 줄에 없다. 앞선 turn_context·thread_settings 줄을 순서대로 추적해
    // 이후 토큰을 그 모델에 귀속시킨다. 세션마다 다시 시작한다.
    // 첫 턴의 thread_settings는 이미 토큰이 오간 뒤에 나오므로 turn_context까지 봐야
    // 세션 앞부분이 통째로 'unknown'으로 새지 않는다.
    let currentModel = 'unknown'

    await scanJsonl(
      file,
      (line) =>
        line.includes(TOKEN_HINT) ||
        line.includes(THREAD_SETTINGS_HINT) ||
        line.includes(TURN_CONTEXT_HINT),
      (raw) => {
        const entry = raw as RolloutEntry
        const payload = entry.payload
        if (!payload) return

        const model =
          payload.thread_settings?.model ?? (entry.type === 'turn_context' ? payload.model : undefined)
        if (typeof model === 'string' && model.length > 0) {
          currentModel = model
          return
        }

        if (payload.type !== 'token_count') return

        const at = Date.parse(String(entry.timestamp))
        if (!Number.isFinite(at) || at < startMs || at > endMs) return

        // total_token_usage는 세션 누적이라 더하면 수십 배로 부푼다. 증분만 더한다.
        const usage = payload.info?.last_token_usage
        if (!usage) return

        // input_tokens는 cached_input_tokens를 포함한다(total_tokens = input + output로 확인).
        // 그대로 더하면 캐시가 두 번 세지므로 캐시분을 빼고 입력으로 잡는다.
        const cached = toCount(usage.cached_input_tokens)
        const input = Math.max(0, toCount(usage.input_tokens) - cached)
        const output = toCount(usage.output_tokens)
        if (input + cached + output === 0) return

        inputTokens += input
        cachedTokens += cached
        outputTokens += output
        counted++
        sessions.add(file)
        models[currentModel] = (models[currentModel] ?? 0) + input + cached + output

        const primary = payload.rate_limits?.primary
        if (primary && at > limitAt) {
          limitAt = at
          const percent = primary.used_percent
          limitUsedPercent =
            typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100
              ? percent
              : null
          // resets_at은 epoch 초다
          const resets = primary.resets_at
          limitResetsAt =
            typeof resets === 'number' && Number.isFinite(resets)
              ? new Date(resets * 1000).toISOString()
              : null
        }
      }
    )
  }

  if (counted === 0) return null

  const planRaw = readPlanRaw(home)
  return {
    client: 'codex',
    planRaw,
    plan: toCodexPlanName(planRaw),
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    inputTokens,
    outputTokens,
    cachedTokens,
    sessions: sessions.size,
    models,
    limitUsedPercent,
    limitResetsAt,
  }
}
