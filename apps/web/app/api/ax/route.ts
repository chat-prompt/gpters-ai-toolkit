/**
 * AX Dashboard — 패널 목록 API
 *
 * GET /api/ax
 * 요청자가 볼 수 있는 패널의 메타데이터만 내려준다 (데이터는 패널별 API에서).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { listAxPanels, resolveAxViewer } from '@/lib/features/ax'
import type { UserRole } from '@/lib/security/rbac'

const log = createLogger('api:ax')

export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const session = await auth()
  const viewer = resolveAxViewer({
    email: session?.user?.email,
    role: session?.user?.role as UserRole | undefined,
  })

  if (!viewer.canAccess) {
    if (viewer.reason === 'domain_not_configured') {
      log.warn('INTERNAL_ORGANIZATION_DOMAIN이 설정되지 않아 AX 대시보드 접근을 차단했다')
      return ApiErrors.forbidden('대시보드 접근 설정이 완료되지 않았습니다. 운영자에게 문의하세요')
    }
    return viewer.reason === 'unauthenticated'
      ? ApiErrors.unauthorized('로그인이 필요합니다')
      : ApiErrors.forbidden('사내 구성원만 접근할 수 있습니다')
  }

  return NextResponse.json({
    panels: listAxPanels(viewer),
    isAdmin: viewer.isAdmin,
  })
}
