/**
 * AX Dashboard — 패널 데이터 API
 *
 * GET /api/ax/{panelId}?days=30
 *
 * 패널이 레지스트리에 등록돼 있으면 이 라우트 하나로 처리된다.
 * 새 지표를 붙일 때 라우트를 추가할 필요가 없다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { canViewPanel, getAxPanel, resolveAxViewer } from '@/lib/features/ax'
import type { UserRole } from '@/lib/security/rbac'

const log = createLogger('api:ax:panel')

/** 허용 조회 기간(일) */
const ALLOWED_DAYS = [7, 30, 90] as const
const DEFAULT_DAYS = 30

function parseDays(raw: string | null): number {
  const parsed = Number(raw)
  return (ALLOWED_DAYS as readonly number[]).includes(parsed) ? parsed : DEFAULT_DAYS
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ panel: string }> }
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const { panel: panelId } = await params

  const session = await auth()
  const viewer = resolveAxViewer({
    email: session?.user?.email,
    role: session?.user?.role as UserRole | undefined,
  })

  if (!viewer.canAccess) {
    if (viewer.reason === 'domain_not_configured') {
      // 환경변수 누락으로 전원이 차단되는 상황 — 원인을 모르면 아무도 못 고친다
      log.warn('INTERNAL_ORGANIZATION_DOMAIN이 설정되지 않아 AX 대시보드 접근을 차단했다')
      return ApiErrors.forbidden('대시보드 접근 설정이 완료되지 않았습니다. 운영자에게 문의하세요')
    }
    return viewer.reason === 'unauthenticated'
      ? ApiErrors.unauthorized('로그인이 필요합니다')
      : ApiErrors.forbidden('사내 구성원만 접근할 수 있습니다')
  }

  const panel = getAxPanel(panelId)
  if (!panel) {
    return ApiErrors.badRequest('알 수 없는 패널입니다')
  }

  if (!canViewPanel(viewer, panel.meta.visibility)) {
    return ApiErrors.forbidden('관리자만 볼 수 있는 패널입니다')
  }

  const days = parseDays(new URL(request.url).searchParams.get('days'))

  // 관리자에게는 개인 식별 데이터가 포함될 수 있으므로 조회 사실을 남긴다
  if (viewer.isAdmin) {
    log.info('관리자 패널 조회', { panelId, viewer: session?.user?.email })
  }

  try {
    const result = await panel.load({
      days,
      isAdmin: viewer.isAdmin,
    })
    return NextResponse.json(result)
  } catch (error) {
    log.error('패널 로딩 실패', error, { panelId })
    return ApiErrors.internalError('패널 데이터를 불러오지 못했습니다')
  }
}
