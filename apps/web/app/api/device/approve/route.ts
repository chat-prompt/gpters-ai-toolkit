/**
 * Device Code Approval Endpoint
 *
 * 인증된 사용자가 device code를 승인하거나 거부합니다.
 * 웹 UI(/device 페이지)에서 호출됩니다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db, deviceCodes } from '@/lib/db'
import { createLogger } from '@/lib/core/logger'
import { eq, and, gt, sql } from 'drizzle-orm'

const log = createLogger('api:device:approve')

/**
 * POST /api/device/approve
 *
 * @body { user_code: string, action: "approve" | "deny" }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: { user_code?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { user_code, action } = body

  if (!user_code || !action) {
    return NextResponse.json({ error: 'user_code and action are required' }, { status: 400 })
  }

  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'action must be "approve" or "deny"' }, { status: 400 })
  }

  try {
    // user_code로 조회 (대소문자 무시, pending 상태, 미만료)
    const normalizedCode = user_code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const [record] = await db
      .select()
      .from(deviceCodes)
      .where(
        and(
          sql`REPLACE(UPPER(${deviceCodes.userCode}), '-', '') = ${normalizedCode}`,
          eq(deviceCodes.status, 'pending'),
          gt(deviceCodes.expiresAt, new Date())
        )
      )

    if (!record) {
      return NextResponse.json(
        { error: 'Invalid or expired code. Please check and try again.' },
        { status: 404 }
      )
    }

    if (action === 'approve') {
      await db
        .update(deviceCodes)
        .set({ status: 'approved', userId: session.user.id })
        .where(eq(deviceCodes.id, record.id))
      log.info('Device code approved', { userCode: record.userCode, userId: session.user.id })
      return NextResponse.json({ success: true, message: 'Device authorized' })
    } else {
      await db
        .update(deviceCodes)
        .set({ status: 'denied' })
        .where(eq(deviceCodes.id, record.id))
      log.info('Device code denied', { userCode: record.userCode, userId: session.user.id })
      return NextResponse.json({ success: true, message: 'Device authorization denied' })
    }
  } catch (err) {
    log.error('Device approval failed', { error: err })
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 })
  }
}
