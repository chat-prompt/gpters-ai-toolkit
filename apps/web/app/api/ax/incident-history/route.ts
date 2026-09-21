import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { resolveAxViewer } from '@/lib/features/ax'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import type { UserRole } from '@/lib/security/rbac'
import { decodeIncidentHistoryCursor, incidentHistoryQuerySchema, readIncidentHistory } from '../../../../../../packages/lib/src/features/ax/incident-history'

export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
const failure = (message: string, status: number) => NextResponse.json({ message }, { status, headers })
export async function GET(request: NextRequest) {
  const limited = withRateLimit(request, RateLimitPresets.standard)
  if (limited) return limited
  const session = await auth()
  const viewer = resolveAxViewer({ email: session?.user?.email, role: session?.user?.role as UserRole })
  if (!viewer.canAccess || !viewer.isAdmin || !session?.user?.id) return failure('사내 관리자 로그인이 필요합니다', 403)
  if (process.env.AX_INCIDENT_REVIEW_ENABLED !== 'true') return failure('문제 검토 저장소를 준비 중입니다', 503)
  const params = new URL(request.url).searchParams
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return failure('조회 조건을 확인하세요', 400)
  const parsed = incidentHistoryQuerySchema.safeParse(Object.fromEntries(params))
  if (!parsed.success) return failure('조회 조건을 확인하세요', 400)
  try { decodeIncidentHistoryCursor(parsed.data) } catch { return failure('조회 위치가 유효하지 않습니다. 처음부터 조회하세요', 400) }
  try { return NextResponse.json(await readIncidentHistory(parsed.data), { headers }) }
  catch { return failure('저장된 문제 이력을 조회하지 못했습니다', 500) }
}
