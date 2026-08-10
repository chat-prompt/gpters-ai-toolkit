/**
 * ~/.codex/hooks.json에 사용량 보고 훅을 병합하는 유틸리티
 *
 * 이 파일은 우리 것이 아니다. 사용자가 이미 다른 도구(데스크탑 앱, 로컬 브리지 등)의
 * 훅을 등록해 두고 쓰는 공용 파일이라, **덮어쓰지 않고 우리 항목만 얹는다.**
 * 파싱에 실패하면 손대지 않고 물러난다 — 남의 설정을 날리느니 우리 기능을 포기한다.
 *
 * **등록한다고 곧바로 실행되지는 않는다.** Codex는 훅마다 명령 해시를 승인받아야
 * 실행하며(`config.toml`의 `[hooks.state].trusted_hash`), 승인 전에는 호출조차 하지
 * 않는다. 설치 프로그램이 몰래 실행 코드를 심지 못하게 막는 보안 장치다.
 * 우리는 해시를 쓰지 않는다 — 그건 우회이지 설치가 아니다. 사용자가 다음 실행 때
 * 한 번 승인해야 하고, 설치 요약이 그 사실을 알린다.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 우리 훅을 식별하는 표식
 *
 * 명령 문자열에 이게 들어 있으면 이미 설치된 것으로 본다. 경로는 설치 위치에 따라
 * 달라질 수 있으므로 파일명이 아니라 이 고정 문자열로 판별한다.
 */
export const USAGE_HOOK_MARKER = 'gpters-usage-report'

/** 훅이 걸리는 이벤트 (hooks.json은 PascalCase를 쓴다) */
const HOOK_EVENT = 'SessionStart'

/** 훅 하나의 형태 */
interface HookCommand {
  type: 'command'
  command: string
  timeout?: number
}

/** 이벤트에 등록되는 그룹 */
interface HookGroup {
  hooks: HookCommand[]
}

/** hooks.json 전체 형태 (우리가 아는 부분만) */
interface HooksFile {
  hooks?: Record<string, HookGroup[]>
  [key: string]: unknown
}

/**
 * 사용량 보고 훅이 이미 등록돼 있는지 확인한다.
 *
 * @param parsed - 파싱된 hooks.json
 * @returns 이미 있으면 true
 */
export function hasUsageHook(parsed: HooksFile): boolean {
  const groups = parsed.hooks?.[HOOK_EVENT]
  if (!Array.isArray(groups)) return false

  return groups.some((group) =>
    Array.isArray(group?.hooks)
      ? group.hooks.some((hook) => typeof hook?.command === 'string' && hook.command.includes(USAGE_HOOK_MARKER))
      : false
  )
}

/**
 * 사용량 보고 훅을 추가한 새 객체를 돌려준다.
 *
 * 기존 이벤트·그룹은 그대로 두고 배열 끝에 우리 그룹 하나만 붙인다.
 * 이미 있으면 원본을 그대로 돌려준다.
 *
 * @param parsed - 파싱된 hooks.json
 * @param scriptPath - 실행할 스크립트 절대 경로
 * @returns 훅이 병합된 객체
 */
export function mergeUsageHook(parsed: HooksFile, scriptPath: string): HooksFile {
  if (hasUsageHook(parsed)) return parsed

  const hooks = { ...(parsed.hooks ?? {}) }
  const existing = Array.isArray(hooks[HOOK_EVENT]) ? hooks[HOOK_EVENT] : []

  // 스크립트 자체가 하루 한 번으로 제한하고 백그라운드로 떼어내므로
  // 타임아웃은 짧아도 된다. 길게 잡아 세션 시작을 붙잡는 쪽이 더 나쁘다.
  hooks[HOOK_EVENT] = [
    ...existing,
    {
      hooks: [
        {
          type: 'command',
          command: `"${scriptPath}"`,
          timeout: 5,
        },
      ],
    },
  ]

  return { ...parsed, hooks }
}

/**
 * hooks.json을 읽어 사용량 보고 훅을 보장한다.
 *
 * @param hooksPath - hooks.json 절대 경로
 * @param scriptPath - 실행할 스크립트 절대 경로
 * @returns 'added'(추가됨) · 'skipped'(이미 있음) · 'failed'(읽거나 쓸 수 없음)
 */
export function ensureUsageHook(
  hooksPath: string,
  scriptPath: string
): 'added' | 'skipped' | 'failed' {
  let parsed: HooksFile = {}

  if (existsSync(hooksPath)) {
    try {
      const raw = readFileSync(hooksPath, 'utf-8')
      const value = raw.trim().length > 0 ? JSON.parse(raw) : {}
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'failed'
      }
      parsed = value as HooksFile
    } catch {
      // 남이 쓰던 파일이 깨져 있거나 우리가 모르는 형식이다.
      // 여기서 새로 쓰면 그 사람의 훅이 통째로 사라진다.
      return 'failed'
    }
  }

  if (hasUsageHook(parsed)) return 'skipped'

  try {
    const merged = mergeUsageHook(parsed, scriptPath)
    mkdirSync(dirname(hooksPath), { recursive: true })
    // 들여쓰기 2칸 — 사람이 직접 열어 보는 파일이다
    writeFileSync(hooksPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8')
    return 'added'
  } catch {
    return 'failed'
  }
}
