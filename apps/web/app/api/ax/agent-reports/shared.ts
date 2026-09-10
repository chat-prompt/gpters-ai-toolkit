import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@gpters/lib/security'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { IncidentConflict, IncidentValidationError } from '@/lib/features/ax'

export const reportHeaders = { 'Cache-Control':'private, no-store' }
export const reportError = (message: string, status: number) => NextResponse.json({message},{status,headers:reportHeaders})
export async function reportPrincipal(request: NextRequest) {
  const limited = withRateLimit(request,RateLimitPresets.standard)
  if (limited) return {error:limited} as const
  if (process.env.AX_INCIDENT_REVIEW_ENABLED !== 'true' || process.env.AX_INCIDENT_AGENT_REPORTS_ENABLED !== 'true') return {error:reportError('보고 접수를 준비 중입니다',503)} as const
  const authorization = request.headers.get('authorization') ?? ''
  // No cookies, human OAuth tokens, or telemetry collector tokens as fallback.
  if (!/^Bearer aia_[a-f0-9]{64}$/.test(authorization)) return {error:reportError('에이전트 인증이 필요합니다',401)} as const
  const agent = await authenticateAgent(authorization.slice(7))
  if (!agent) return {error:reportError('에이전트 인증을 확인하세요',401)} as const
  if (!process.env.AX_INCIDENT_ORG_ID || agent.orgId !== process.env.AX_INCIDENT_ORG_ID) return {error:reportError('보고가 허용된 조직이 아닙니다',403)} as const
  return {agent} as const
}
export async function reportBody(request: NextRequest): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new IncidentValidationError('JSON 요청이 필요합니다')
  if (Number(request.headers.get('content-length')) > 16000) throw new IncidentValidationError('요청은 16KB 이하여야 합니다')
  const reader = request.body?.getReader()
  if (!reader) throw new IncidentValidationError('JSON 요청이 필요합니다')
  const bytes = new Uint8Array(16000)
  let size = 0
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      if (size + value.byteLength > bytes.byteLength) {
        await reader.cancel()
        throw new IncidentValidationError('요청은 16KB 이하여야 합니다')
      }
      bytes.set(value, size)
      size += value.byteLength
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size))) } catch { throw new IncidentValidationError('잘못된 JSON입니다') }
}
export function reportReceipt(request: NextRequest, id: string, state: string, revision: number, replayed?: boolean) {
  // A relative URL remains on the deployment receiving the authenticated request.
  const url = new URL('/en/ax', request.url)
  url.searchParams.set('panel','agent-incidents'); url.searchParams.set('incident',id)
  return {id,state,revision,url:url.toString(),...(replayed === undefined ? {} : {replayed})}
}
export function handleReportError(error: unknown) {
  if (error instanceof IncidentConflict) return reportError(error.message,409)
  if (error instanceof IncidentValidationError) return reportError(error.message,400)
  return reportError('보고 요청을 처리하지 못했습니다',500)
}
