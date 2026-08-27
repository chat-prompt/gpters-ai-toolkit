/**
 * Claude Code 로컬 트랜스크립트 사용량 수집기
 *
 * ~/.claude/projects 아래 세션 트랜스크립트에서 assistant 응답의 토큰만 합산한다.
 * 대화 내용·파일 경로는 읽되 어디에도 담지 않는다 — 나가는 건 집계 수치와 플랜 문자열뿐이다.
 */

import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findJsonlFiles, scanJsonl, toCount } from './jsonl.js'
import type { UsageRecord, UsageWindow } from './types.js'

/** 토큰이 붙는 줄은 assistant 줄뿐이다 — 이 문자열이 없으면 파싱할 이유가 없다 */
const ASSISTANT_HINT = '"assistant"'

/** statusline usage cache는 5분마다 갱신된다. 이보다 오래된 스냅샷은 현재 한도로 보고하지 않는다. */
const USAGE_CACHE_MAX_AGE_MS = 15 * 60 * 1000

interface ClaudeWeeklyLimit {
  usedPercent: number
  resetsAt: string | null
}

/** 알 수 없는 값을 0~100 범위의 사용률로 바꾼다 */
function toPercent(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null
}

/** Claude usage 응답의 문자열 또는 epoch 초 리셋 시각을 ISO 8601로 바꾼다 */
function toResetIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Claude Code statusline이 캐시한 계정 주간 한도 스냅샷을 읽는다.
 *
 * Claude Code의 `/usage` 화면과 statusline은 계정 단위 rate-limit 데이터를 보여준다.
 * 대화 트랜스크립트에는 이 값이 없으므로, 수집기는 원시 OAuth 토큰 대신 로컬에 이미
 * 만들어진 usage cache의 주간 전체 한도만 읽는다. 캐시가 없거나 오래됐으면 추정하지 않는다.
 *
 * @param home - 홈 디렉터리
 * @param nowMs - 현재 시각(epoch ms). 테스트에서 최신성 경계를 고정할 수 있게 받는다
 */
export function readClaudeWeeklyLimit(home: string, nowMs = Date.now()): ClaudeWeeklyLimit | null {
  const path = join(home, '.claude', 'statusline-usage-cache.json')

  try {
    const age = nowMs - statSync(path).mtimeMs
    if (age < -USAGE_CACHE_MAX_AGE_MS || age > USAGE_CACHE_MAX_AGE_MS) return null

    const cache = JSON.parse(readFileSync(path, 'utf-8')) as {
      seven_day?: { utilization?: unknown; resets_at?: unknown } | null
      limits?: Array<{
        kind?: unknown
        group?: unknown
        percent?: unknown
        resets_at?: unknown
        scope?: unknown
      }>
    }

    let usedPercent = toPercent(cache.seven_day?.utilization)
    let resetsAt = toResetIso(cache.seven_day?.resets_at)

    if (usedPercent === null && Array.isArray(cache.limits)) {
      const weekly = cache.limits.find(
        (limit) =>
          limit.kind === 'weekly_all' ||
          (limit.group === 'weekly' && (limit.scope === null || limit.scope === undefined))
      )
      usedPercent = toPercent(weekly?.percent)
      resetsAt = toResetIso(weekly?.resets_at)
    }

    if (usedPercent === null) return null
    if (resetsAt !== null && new Date(resetsAt).getTime() <= nowMs) return null

    return { usedPercent, resetsAt }
  } catch {
    return null
  }
}

/** 트랜스크립트 한 줄에서 실제로 쓰는 부분 */
interface AssistantEntry {
  type?: unknown
  timestamp?: unknown
  sessionId?: unknown
  message?: {
    id?: unknown
    model?: unknown
    /** 값이 있으면 완료된 응답, 없으면 스트리밍 도중 기록된 미완성 줄이다 */
    stop_reason?: unknown
    usage?: Record<string, unknown>
  }
}

/** 같은 message.id의 여러 줄 중 채택한 한 줄 */
interface Snapshot {
  input: number
  cached: number
  output: number
  model: string
  /** stop_reason이 있는 완료된 줄인가 */
  complete: boolean
}

/**
 * 두 스냅샷 중 어느 쪽을 채택할지 정한다
 *
 * 완료된 줄이 미완성 줄을 이기고, 같은 상태면 토큰 합이 큰 쪽을 쓴다.
 * 필드별로 따로 최댓값을 취하면 어느 줄에도 없던 조합이 만들어지므로 줄 단위로 고른다.
 *
 * @param candidate - 새로 만난 줄
 * @param current - 지금까지 채택해 둔 줄
 * @returns candidate로 갈아끼워야 하면 true
 */
function isBetterSnapshot(candidate: Snapshot, current: Snapshot): boolean {
  if (candidate.complete !== current.complete) return candidate.complete
  const candidateTotal = candidate.input + candidate.cached + candidate.output
  const currentTotal = current.input + current.cached + current.output
  return candidateTotal > currentTotal
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
  const weeklyLimit = readClaudeWeeklyLimit(home)
  const files = await findJsonlFiles(join(home, '.claude', 'projects'), window.start)
  if (files.length === 0) return null

  const startMs = window.start.getTime()
  const endMs = window.end.getTime()

  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  const models: Record<string, number> = {}
  const sessions = new Set<string>()
  // 같은 message.id가 여러 줄로 나타나는 경우가 둘 있다.
  // (1) 컴팩션이 같은 응답을 여러 트랜스크립트에 복제한다 — 그대로 더하면 총량이 부푼다.
  // (2) 응답이 스트리밍되는 동안 같은 id로 여러 번 기록된다. 먼저 쓰인 줄은 stop_reason이 없는
  //     미완성 상태다 — 첫 줄만 채택하면 완성본을 놓친다.
  // 그래서 id마다 채택한 줄 하나를 들고 있다가, 더 나은 줄이 오면 이전 기여분을 빼고 갈아끼운다.
  // 줄 단위로 통째 채택해야 모델 귀속도 한 줄로 유지되고, 필드가 행끼리 섞이지 않는다.
  // (260820: 첫 줄 채택으로 출력 토큰 32.5% 과소집계 중이던 것을 Deletion Test로 발견)
  const adopted = new Map<string, Snapshot>()
  // 모델명 문자열을 재사용해 id가 많을 때 같은 이름의 사본이 쌓이지 않게 한다
  const modelNames = new Map<string, string>()

  for (const file of files) {
    await scanJsonl(
      file,
      (line) => line.includes(ASSISTANT_HINT),
      (raw) => {
        const entry = raw as AssistantEntry
        if (entry.type !== 'assistant') return

        const at = Date.parse(String(entry.timestamp))
        if (!Number.isFinite(at) || at < startMs || at >= endMs) return

        const message = entry.message
        const messageId = message?.id
        if (typeof messageId !== 'string') return

        const usage = message?.usage ?? {}
        // 캐시 생성분은 실제로 새로 읽힌 입력이라 입력 쪽에, 캐시 적중분만 캐시로 센다.
        const input = toCount(usage.input_tokens) + toCount(usage.cache_creation_input_tokens)
        const cached = toCount(usage.cache_read_input_tokens)
        const output = toCount(usage.output_tokens)

        const rawModel = typeof message?.model === 'string' ? message.model : 'unknown'
        const model = modelNames.get(rawModel) ?? (modelNames.set(rawModel, rawModel), rawModel)
        const stopReason = message?.stop_reason
        const candidate: Snapshot = {
          input,
          cached,
          output,
          model,
          complete: typeof stopReason === 'string' && stopReason.length > 0,
        }

        // 미완성 스트리밍 줄은 다음 구간에서 완성본과 다시 잡혀 이중 계상될 수 있다.
        // 완료 시점의 한 구간에만 귀속하도록 stop_reason이 생긴 응답만 집계한다.
        if (!candidate.complete) return

        const previous = adopted.get(messageId)
        if (previous && !isBetterSnapshot(candidate, previous)) return

        // 토큰을 하나도 안 쓴 응답(<synthetic> 등)까지 모델별 집계에 넣으면
        // 계약의 모델 종류 상한만 갉아먹고 대시보드에는 0짜리 줄이 늘어난다.
        const addModelTokens = (name: string, amount: number) => {
          if (amount === 0) return
          const next = (models[name] ?? 0) + amount
          if (next > 0) models[name] = next
          else delete models[name]
        }

        if (previous) {
          // 이전에 채택한 줄의 기여분을 되돌린 뒤 새 줄로 갈아끼운다
          inputTokens -= previous.input
          cachedTokens -= previous.cached
          outputTokens -= previous.output
          addModelTokens(previous.model, -(previous.input + previous.cached + previous.output))
        } else {
          // 세션은 응답을 처음 본 곳에서만 센다. 컴팩션 사본이 다른 세션에 복제돼도
          // 세션 수가 늘지 않는다 — 토큰 집계만 고치고 세션 계산은 그대로 두려는 것.
          if (typeof entry.sessionId === 'string') sessions.add(entry.sessionId)
        }

        adopted.set(messageId, candidate)
        inputTokens += input
        cachedTokens += cached
        outputTokens += output
        addModelTokens(model, input + cached + output)
      }
    )
  }

  if (adopted.size === 0) return null

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
    // 트랜스크립트가 아니라 Claude statusline의 최신 계정 한도 스냅샷에서 가져온다.
    // 캐시가 없거나 오래됐으면 0으로 추정하지 않고 null을 유지한다.
    limitUsedPercent: weeklyLimit?.usedPercent ?? null,
    limitResetsAt: weeklyLimit?.resetsAt ?? null,
  }
}
