import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { isIncidentReviewer, resolveAxViewer } from '@/lib/features/ax'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import type { UserRole } from '@/lib/security/rbac'
import { enrollStoredReportInbox, reportInboxEnrollmentSchema, ReportInboxConflict, ReportInboxInputError } from '../../../../../../packages/lib/src/features/ax/report-inbox-store'

const headers = { 'Cache-Control': 'private, no-store' }
const failure = (message: string, status: number) => NextResponse.json({ message }, { status, headers })
export async function POST(request: NextRequest) {
  const limited = withRateLimit(request, RateLimitPresets.standard)
  if (limited) return limited
  const session = await auth()
  const viewer = resolveAxViewer({ email: session?.user?.email, role: session?.user?.role as UserRole })
  if (!viewer.canAccess || !viewer.isAdmin || !isIncidentReviewer(session?.user?.id)) return failure('지정된 사내 검토자 로그인이 필요합니다', 403)
  if (process.env.AX_REPORT_INBOX_ENABLED !== 'true' || process.env.AX_INCIDENT_REVIEW_ENABLED !== 'true') return failure('보고 감시 등록이 비활성입니다', 503)
  if (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json')) return failure('허용되지 않은 요청입니다', 403)
  try {
    if (Number(request.headers.get('content-length')) > 4096) return failure('요청이 너무 큽니다', 413)
    const text = await request.text()
    if (text.length > 4096) return failure('요청이 너무 큽니다', 413)
    let body: unknown
    try { body = JSON.parse(text) } catch { return failure('등록 항목을 확인하세요', 400) }
    const parsed = reportInboxEnrollmentSchema.safeParse(body)
    if (!parsed.success) return failure('원 스레드 확인과 만료 시각이 필요합니다', 400)
    return NextResponse.json(await enrollStoredReportInbox(parsed.data, new URL(request.url).origin, session!.user!.id!), { status: 201, headers })
  } catch (error) {
    if (error instanceof ReportInboxInputError) return failure(error.message, 400)
    if (error instanceof ReportInboxConflict) return failure(error.message, 409)
    return failure('보고 감시를 등록하지 못했습니다', 500)
  }
}
