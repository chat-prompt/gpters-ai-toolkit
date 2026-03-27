/**
 * Device Token Polling Endpoint (RFC 8628)
 *
 * CLI가 주기적으로 호출하여 사용자 승인 여부를 확인합니다.
 * 승인 완료 시 access token을 발급합니다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, deviceCodes } from '@/lib/db'
import { createAccessToken } from '@/lib/security/oauth-tokens'
import { CLI_TOKEN_TTL_MS, CLI_TOKEN_SCOPE } from '@/lib/security/cli-client'
import { withRateLimit } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/core/logger'
import { eq } from 'drizzle-orm'

const log = createLogger('api:device:token')

/** Polling rate limit: 20/min per IP */
const POLLING_RATE_LIMIT = { limit: 20, windowSec: 60 }

/**
 * POST /api/device/token
 *
 * RFC 8628 device token polling. CLI가 device_code로 승인 상태를 확인합니다.
 */
export async function POST(request: NextRequest) {
  const rateLimited = withRateLimit(request, POLLING_RATE_LIMIT)
  if (rateLimited) return rateLimited

  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid JSON body' }, { status: 400 })
  }

  const { device_code, grant_type } = body

  if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'Use urn:ietf:params:oauth:grant-type:device_code' },
      { status: 400 }
    )
  }

  if (!device_code) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'device_code is required' },
      { status: 400 }
    )
  }

  try {
    const [record] = await db
      .select()
      .from(deviceCodes)
      .where(eq(deviceCodes.deviceCode, device_code))

    if (!record) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Unknown device code' },
        { status: 400 }
      )
    }

    // 만료 체크
    if (new Date() > record.expiresAt) {
      await db.delete(deviceCodes).where(eq(deviceCodes.id, record.id))
      return NextResponse.json(
        { error: 'expired_token', error_description: 'Device code has expired' },
        { status: 400 }
      )
    }

    // Slow down 체크: interval 미만 간격으로 polling하면 거부
    if (record.lastPolledAt) {
      const elapsed = (Date.now() - record.lastPolledAt.getTime()) / 1000
      if (elapsed < record.interval) {
        // slow_down 시 interval 5초 증가 (RFC 8628 §3.5)
        await db
          .update(deviceCodes)
          .set({ interval: record.interval + 5, lastPolledAt: new Date() })
          .where(eq(deviceCodes.id, record.id))
        return NextResponse.json(
          { error: 'slow_down', error_description: 'Polling too fast', interval: record.interval + 5 },
          { status: 400 }
        )
      }
    }

    // lastPolledAt 갱신
    await db
      .update(deviceCodes)
      .set({ lastPolledAt: new Date() })
      .where(eq(deviceCodes.id, record.id))

    // 상태별 처리
    switch (record.status) {
      case 'pending':
        return NextResponse.json(
          { error: 'authorization_pending', error_description: 'User has not yet approved' },
          { status: 400 }
        )

      case 'denied':
        await db.delete(deviceCodes).where(eq(deviceCodes.id, record.id))
        return NextResponse.json(
          { error: 'access_denied', error_description: 'User denied the request' },
          { status: 400 }
        )

      case 'approved': {
        if (!record.userId) {
          log.error('Approved device code without userId', { id: record.id })
          return NextResponse.json({ error: 'server_error' }, { status: 500 })
        }

        // 토큰 발급
        const expiresAt = new Date(Date.now() + CLI_TOKEN_TTL_MS)
        const { token } = await createAccessToken({
          clientId: record.clientId,
          userId: record.userId,
          scope: CLI_TOKEN_SCOPE,
          expiresAt,
        })

        // Device code 삭제 (일회용)
        await db.delete(deviceCodes).where(eq(deviceCodes.id, record.id))

        log.info('Device flow token issued', { userId: record.userId })

        return NextResponse.json({
          access_token: token,
          token_type: 'Bearer',
          expires_in: Math.floor(CLI_TOKEN_TTL_MS / 1000),
          scope: CLI_TOKEN_SCOPE,
        })
      }

      default:
        return NextResponse.json(
          { error: 'expired_token', error_description: 'Device code is no longer valid' },
          { status: 400 }
        )
    }
  } catch (err) {
    log.error('Device token polling failed', { error: err })
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
