/**
 * whoami 명령어 - 현재 인증된 사용자 정보 확인
 */

import { apiCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { info, error } from '../output.js'

/** whoami API 응답 구조 */
interface WhoamiResponse {
  /** 성공 여부 */
  success: boolean
  /** 사용자 정보 */
  user?: {
    /** 사용자 ID */
    id: string
    /** 이름 */
    name?: string
    /** 이메일 */
    email?: string
    /** 소속 조직 */
    org?: { id: string; name?: string } | null
  }
  /** 에러 메시지 */
  error?: string
}

/**
 * whoami 명령어 실행 - 현재 토큰의 사용자 정보 출력
 */
export async function runWhoami(): Promise<void> {
  const token = resolveToken()
  if (!token) {
    error('No token found. Run "aitk login" first.', 2)
  }

  const result = await apiCall<WhoamiResponse>('whoami', {}, token)

  if (!result.ok) {
    if (result.status === 401) error('Invalid or expired token. Run "aitk login" to re-authenticate.', 2)
    error(result.error!)
  }

  const data = result.data
  if (!data?.success || !data.user) {
    error(data?.error ?? 'Failed to get user info')
  }

  const user = data!.user!
  info(`Logged in as: ${user.email ?? user.name ?? user.id}`)
  if (user.name) info(`Name: ${user.name}`)
  if (user.org) {
    info(`Org: ${user.org.name ?? user.org.id}`)
  } else {
    info('Org: (none)')
  }
}
