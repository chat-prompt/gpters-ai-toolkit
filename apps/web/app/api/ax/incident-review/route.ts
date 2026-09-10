import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { resolveAxViewer, incidentActionSchema, saveIncidentReview, IncidentConflict, IncidentValidationError } from '@/lib/features/ax'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import type { UserRole } from '@/lib/security/rbac'

export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store' }
const failure = (message: string, status: number) => NextResponse.json({ message }, { status, headers })
export async function POST(request: NextRequest) {
  const limited = withRateLimit(request, RateLimitPresets.standard)
  if (limited) return limited
  const session = await auth()
  const viewer = resolveAxViewer({ email: session?.user?.email, role: session?.user?.role as UserRole })
  if (!viewer.canAccess || !viewer.isAdmin || !session?.user?.id) return failure('사내 관리자 로그인이 필요합니다', 403)
  if (process.env.AX_INCIDENT_REVIEW_ENABLED !== 'true') return failure('문제 검토 저장소를 준비 중입니다', 503)
  // Cookie-authenticated writes require a same-origin JSON request.
  if (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) return failure('허용되지 않은 요청입니다', 403)
  if (Number(request.headers.get('content-length')) > 16000) return failure('요청이 너무 큽니다', 413)
  try {
    const text = await request.text()
    if (text.length > 16000) return failure('요청이 너무 큽니다', 413)
    let json: unknown
    try { json = JSON.parse(text) } catch { return failure('요청 형식을 확인하세요', 400) }
    const parsed = incidentActionSchema.safeParse(json)
    if (!parsed.success) return failure('필수 항목과 입력 형식을 확인하세요', 400)
    const record = await saveIncidentReview(parsed.data, session.user.id)
    return NextResponse.json({ record }, { headers })
  } catch (error) {
    if (error instanceof IncidentConflict) return failure(error.message, 409)
    if (error instanceof IncidentValidationError) return failure(error.message, 400)
    return failure('검토 기록을 저장하지 못했습니다', 500)
  }
}
