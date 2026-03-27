/**
 * Device Authorization Endpoint (RFC 8628)
 *
 * CLI가 브라우저 없이 인증을 시작할 때 호출합니다.
 * device_code(polling용)와 user_code(사용자 입력용)를 발급합니다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, deviceCodes } from '@/lib/db'
import { ensureCliClient } from '@/lib/security/cli-client'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/core/logger'
import { getBaseUrl } from '@/lib/utils'

const log = createLogger('api:device:code')

/** Device code 만료: 15분 */
const DEVICE_CODE_TTL_MS = 15 * 60 * 1000

/** User code에 사용할 문자 (혼동 가능 문자 제외: 0,O,1,I,L) */
const USER_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * 사람이 읽기 쉬운 user code 생성 (XXXX-XXXX 형식)
 *
 * @returns "ABCD-1234" 형식의 코드
 */
function generateUserCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = Array.from(bytes)
    .map((b) => USER_CODE_CHARS[b % USER_CODE_CHARS.length])
    .join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

/**
 * 안전한 device code 생성 (64 hex chars)
 *
 * @returns 64자 hex 문자열
 */
function generateDeviceCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * POST /api/device/code
 *
 * Device authorization 요청을 처리하고 device_code + user_code를 반환합니다.
 */
export async function POST(request: NextRequest) {
  const rateLimited = withRateLimit(request, RateLimitPresets.auth)
  if (rateLimited) return rateLimited

  try {
    const clientId = await ensureCliClient()
    const deviceCode = generateDeviceCode()
    const userCode = generateUserCode()
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS)
    const baseUrl = getBaseUrl()

    await db.insert(deviceCodes).values({
      deviceCode,
      userCode,
      clientId,
      scope: 'mcp:tools mcp:prompts',
      expiresAt,
    })

    log.info('Device code issued', { userCode, expiresAt: expiresAt.toISOString() })

    return NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${baseUrl}/device`,
      interval: 5,
      expires_in: 900,
    })
  } catch (err) {
    log.error('Device code generation failed', { error: err })
    return NextResponse.json({ error: 'Device code generation failed' }, { status: 500 })
  }
}
