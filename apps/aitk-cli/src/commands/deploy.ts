/**
 * deploy 명령어 - 스킬/에이전트/커맨드 배포
 */

import { readFileSync } from 'node:fs'
import { apiCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/** deploy 명령어 옵션 */
export interface DeployOptions {
  /** 영문 slug ID */
  id: string
  /** 아이템 타입 */
  type: string
  /** 표시 이름 */
  name: string
  /** 콘텐츠 (텍스트 또는 @file 경로) */
  content: string
  /** 설명 */
  description?: string
  /** 태그 (콤마 구분) */
  tags?: string
  /** 플랫폼 (콤마 구분, 예: claude_code,codex) */
  platforms?: string
  /** 변경 사유 (업데이트 시 서버에서 필수) */
  changelog?: string
}

/**
 * 콘텐츠 값 해석 (@file이면 파일에서 읽기)
 *
 * @param value - 콘텐츠 문자열 또는 @파일경로
 * @returns 실제 콘텐츠
 */
function resolveContent(value: string): string {
  if (value.startsWith('@')) {
    const filePath = value.slice(1)
    try {
      return readFileSync(filePath, 'utf-8')
    } catch {
      error(`Cannot read file: ${filePath}`)
    }
  }
  return value
}

/**
 * deploy 명령어 실행
 *
 * @param opts - 배포 옵션
 */
export async function runDeploy(opts: DeployOptions): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const content = resolveContent(opts.content)
  const params: Record<string, unknown> = {
    id: opts.id,
    type: opts.type,
    name: opts.name,
    content,
  }
  if (opts.description) params.description = opts.description
  if (opts.tags) params.tags = opts.tags.split(',').map((t) => t.trim())
  if (opts.platforms) params.platforms = opts.platforms.split(',').map((p) => p.trim())
  if (opts.changelog) params.changelog = opts.changelog

  const result = await apiCall('deploy', params, token)

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  jsonOut(result.data)
}
