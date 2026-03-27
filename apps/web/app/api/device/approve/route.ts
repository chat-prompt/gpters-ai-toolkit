/**
 * Device Code Approval Endpoint
 *
 * 인증된 사용자가 device code를 승인하거나 거부합니다.
 * 웹 UI(/device 페이지)에서 호출됩니다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db, deviceCodes, users } from '@/lib/db'
import { createLogger } from '@/lib/core/logger'
import { eq } from 'drizzle-orm'

const log = createLogger('api:device:approve')

/**
 * POST /api/device/approve
 *
 * @body { user_code: string, action: "approve" | "deny" }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // dbUser.id는 NextAuth ID이므로, DB에서 실제 user ID를 조회
  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email))
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
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
    // user_code 정규화: 하이픈 제거 후 대문자, 다시 XXXX-XXXX 포맷으로
    const cleaned = user_code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const formatted = cleaned.length >= 5
      ? `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`
      : cleaned

    log.info('Looking up device code', { formatted, userId: dbUser.id })

    const results = await db
      .select()
      .from(deviceCodes)
      .where(eq(deviceCodes.userCode, formatted))

    log.info('Device code lookup result', { count: results.length, statuses: results.map(r => r.status) })

    // pending 상태 + 미만료 필터
    const record = results.find(r => r.status === 'pending' && r.expiresAt > new Date())

    if (!record) {
      return NextResponse.json(
        { error: 'Invalid or expired code. Please check and try again.' },
        { status: 404 }
      )
    }

    if (action === 'approve') {
      await db
        .update(deviceCodes)
        .set({ status: 'approved', userId: dbUser.id })
        .where(eq(deviceCodes.id, record.id))
      log.info('Device code approved', { userCode: record.userCode, userId: dbUser.id })
      return NextResponse.json({ success: true, message: 'Device authorized' })
    } else {
      await db
        .update(deviceCodes)
        .set({ status: 'denied' })
        .where(eq(deviceCodes.id, record.id))
      log.info('Device code denied', { userCode: record.userCode, userId: dbUser.id })
      return NextResponse.json({ success: true, message: 'Device authorization denied' })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
    log.error('Device approval failed', { error: errMsg, stack: err instanceof Error ? err.stack : undefined })
    return NextResponse.json({ error: `Approval failed: ${errMsg}` }, { status: 500 })
  }
}
