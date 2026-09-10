import { NextRequest, NextResponse } from 'next/server'
import { allowedReportWorkspace, incidentSupplementSchema, readOwnIncidentReport, supplementIncidentReport } from '@/lib/features/ax'
import { handleReportError, reportBody, reportError, reportHeaders, reportPrincipal, reportReceipt } from '../shared'
export const maxDuration = 60
type Context = {params:Promise<{id:string}>}
export async function GET(request: NextRequest, context: Context) {
  try {
    const auth=await reportPrincipal(request); if(auth.error)return auth.error
    const {id}=await context.params
    if(!/^report_[a-f0-9]{32}$/.test(id))return reportError('잘못된 보고 ID입니다',400)
    const record=await readOwnIncidentReport(auth.agent,id)
    if(!record)return reportError('보고를 찾지 못했습니다',404)
    return NextResponse.json({...reportReceipt(request,id,record.state,record.revision),
      pendingReview:record.report!.pendingReview,
      reviews:record.history.filter(h=>h.action!=='reported').map(({at,action,reason,evidenceRef})=>({at,action,reason,evidenceRef})),
      supplements:record.report!.supplements.map(({digest:_digest,...value})=>value),
    },{headers:reportHeaders})
  } catch(error) { return handleReportError(error) }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const auth=await reportPrincipal(request); if(auth.error)return auth.error
    const {id}=await context.params
    if(!/^report_[a-f0-9]{32}$/.test(id))return reportError('잘못된 보고 ID입니다',400)
    const parsed=incidentSupplementSchema.safeParse(await reportBody(request))
    if(!parsed.success)return reportError('보완 항목과 재검증 결과를 확인하세요',400)
    if(!allowedReportWorkspace([parsed.data.evidenceUrl]))return reportError('허용된 Slack 워크스페이스의 링크가 필요합니다',400)
    const result=await supplementIncidentReport(auth.agent,id,parsed.data)
    if(!result)return reportError('보고를 찾지 못했습니다',404)
    return NextResponse.json(reportReceipt(request,id,result.record.state,result.record.revision,result.replayed),{headers:reportHeaders})
  } catch(error) { return handleReportError(error) }
}
