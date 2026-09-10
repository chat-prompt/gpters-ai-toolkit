import { NextRequest, NextResponse } from 'next/server'
import { allowedReactionReport, allowedReportWorkspace, incidentReportSchema, submitIncidentReport } from '@/lib/features/ax'
import { handleReportError, reportBody, reportError, reportHeaders, reportPrincipal, reportReceipt } from './shared'
export const maxDuration = 60
export async function POST(request: NextRequest) {
  try {
    const auth = await reportPrincipal(request)
    if (auth.error) return auth.error
    const parsed = incidentReportSchema.safeParse(await reportBody(request))
    if (!parsed.success) return reportError('보고 항목과 요청 근거를 확인하세요',400)
    if (!allowedReportWorkspace([parsed.data.issueUrl,...(parsed.data.approvalUrl ? [parsed.data.approvalUrl] : [])])) return reportError('허용된 Slack 워크스페이스의 링크가 필요합니다',400)
    if (!allowedReactionReport(parsed.data)) return reportError('허용된 이모지·요청자의 보고 경로가 아닙니다',403)
    const {record,replayed} = await submitIncidentReport(auth.agent,parsed.data)
    return NextResponse.json(reportReceipt(request,record.id,record.state,record.revision,replayed),{status:replayed?200:201,headers:reportHeaders})
  } catch(error) { return handleReportError(error) }
}
