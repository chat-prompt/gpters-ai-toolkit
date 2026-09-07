/**
 * 개별 승인 외부 계정 관리 API
 *
 * GET: 승인된 외부 계정 목록
 * POST: 계정 승인 추가
 * DELETE: 계정 승인 취소
 *
 * 슈퍼 어드민만 호출할 수 있고, 변경은 배포 없이 즉시 로그인 정책에 반영된다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { allowedExternalAccounts, users } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { ApiErrors, apiSuccess } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { isSuperAdmin } from '@/lib/security/rbac'
import { isGptersEmail } from '@gpters/lib/account-access'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:admin:allowed-accounts')

/** 도메인 라벨이 최소 한 번은 점으로 구분된 평범한 주소만 받는다 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/

/** 승인 목록에 저장·조회할 때 쓰는 정규화 형태 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * 슈퍼 어드민 세션을 확인한다.
 *
 * @returns 거부 응답, 또는 통과했을 때의 세션 사용자 id
 */
async function requireSuperAdmin(): Promise<
  { error: NextResponse } | { error: null; userId: string }
> {
  const session = await auth()
  if (!session?.user) {
    return { error: ApiErrors.unauthorized() }
  }

  if (!isSuperAdmin(session.user.role)) {
    return { error: ApiErrors.forbidden('super_admin role required to manage allowed accounts') }
  }

  return { error: null, userId: session.user.id }
}

/**
 * GET /api/admin/allowed-accounts
 * 승인된 외부 계정을 최근 승인 순으로 반환한다.
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const guard = await requireSuperAdmin()
  if (guard.error) return guard.error

  try {
    const accounts = await db
      .select({
        email: allowedExternalAccounts.email,
        note: allowedExternalAccounts.note,
        createdAt: allowedExternalAccounts.createdAt,
        addedByEmail: users.email,
      })
      .from(allowedExternalAccounts)
      .leftJoin(users, eq(users.id, allowedExternalAccounts.addedByUserId))
      .orderBy(desc(allowedExternalAccounts.createdAt))

    return NextResponse.json({ accounts })
  } catch (error) {
    log.error('Failed to list allowed accounts', error)
    return ApiErrors.internalError('Failed to list allowed accounts')
  }
}

/**
 * POST /api/admin/allowed-accounts
 * 외부 계정 하나를 승인한다.
 *
 * Body: { email: string, note?: string }
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const guard = await requireSuperAdmin()
  if (guard.error) return guard.error

  try {
    const body = await request.json()
    const { email, note } = body

    if (typeof email !== 'string' || email.trim().length === 0) {
      return ApiErrors.badRequest('email is required')
    }

    const normalizedEmail = normalizeEmail(email)

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return ApiErrors.badRequest('email must be a valid address')
    }

    if (isGptersEmail(normalizedEmail)) {
      return ApiErrors.badRequest('GPTers 계정은 이미 접근할 수 있어 승인이 필요 없습니다')
    }

    if (note !== undefined && typeof note !== 'string') {
      return ApiErrors.badRequest('note must be a string')
    }

    const [existing] = await db
      .select({ email: allowedExternalAccounts.email })
      .from(allowedExternalAccounts)
      .where(eq(allowedExternalAccounts.email, normalizedEmail))
      .limit(1)

    if (existing) {
      return ApiErrors.conflict('Account is already approved')
    }

    const [account] = await db
      .insert(allowedExternalAccounts)
      .values({
        email: normalizedEmail,
        note: note?.trim() || null,
        addedByUserId: guard.userId,
      })
      .returning()

    log.info('External account approved', { email: normalizedEmail, addedByUserId: guard.userId })

    return apiSuccess({ account }, 201)
  } catch (error) {
    log.error('Failed to approve account', error)
    return ApiErrors.internalError('Failed to approve account')
  }
}

/**
 * DELETE /api/admin/allowed-accounts?email=...
 * 승인을 취소한다. 해당 계정의 세션과 CLI/MCP 토큰은 다음 요청부터 막힌다.
 */
export async function DELETE(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const guard = await requireSuperAdmin()
  if (guard.error) return guard.error

  try {
    const email = new URL(request.url).searchParams.get('email')

    if (!email) {
      return ApiErrors.badRequest('email query parameter is required')
    }

    const normalizedEmail = normalizeEmail(email)

    const [removed] = await db
      .delete(allowedExternalAccounts)
      .where(eq(allowedExternalAccounts.email, normalizedEmail))
      .returning()

    if (!removed) {
      return ApiErrors.notFound('Approved account')
    }

    log.info('External account approval revoked', {
      email: normalizedEmail,
      revokedByUserId: guard.userId,
    })

    return NextResponse.json({ success: true, email: normalizedEmail })
  } catch (error) {
    log.error('Failed to revoke account approval', error)
    return ApiErrors.internalError('Failed to revoke account approval')
  }
}
