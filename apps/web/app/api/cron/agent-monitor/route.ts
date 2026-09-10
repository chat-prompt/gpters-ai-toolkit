import { monitorOperationalHealth } from '../../../../../../packages/lib/src/features/ax/monitor-health'
import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runAgentMonitor, readAgentMonitor, monitorConfiguration } from '@/lib/features/ax'
import { processReportInboxes } from '../../../../../../packages/lib/src/features/ax/report-inbox-store'
import { deliverOperatorAlert } from '../../../../../../packages/lib/src/features/ax/monitor-notifications'
import { flushMonitorOutbox } from '@/lib/features/ax'
export const maxDuration=120
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store'}
function validMonitorSecret(header:string|null, secret:string|undefined) {
  if(!secret||secret.length<32||!header?.startsWith('Bearer '))return false
  const a=Buffer.from(header.slice(7)),b=Buffer.from(secret)
  return a.length===b.length&&timingSafeEqual(a,b)
}
export async function GET(request:NextRequest) {
  const heartbeat=request.nextUrl.searchParams.get('heartbeat')==='1'
  const secret=heartbeat?process.env.AX_MONITOR_HEALTH_SECRET:process.env.CRON_SECRET
  if(!validMonitorSecret(request.headers.get('authorization'),secret))return NextResponse.json({message:'Unauthorized'},{status:401,headers})
  if(!monitorConfiguration())return NextResponse.json({message:'Monitor not configured'},{status:503,headers})
  try {
    if(heartbeat) {
      const data=await readAgentMonitor()
      return NextResponse.json({lastSuccessAt:data?.lastSuccessAt??null,healthy:monitorOperationalHealth(data,new Date().toISOString()),backlog:data?.backlog??null,
        oldestUnprocessedAt:data?.oldestUnprocessedAt??null,deferredBacklog:data?.deferredBacklog??null},{headers})
    }
    const result=await runAgentMonitor()
    const outbox=await flushMonitorOutbox()
    const inboxes=await processReportInboxes({deliverOperator:async(id,text)=>{const sent=await deliverOperatorAlert(id,text);if(sent.status==='accepted')return sent;return {...sent,status:sent.status==='cancelled'?'blocked':sent.status}}})
    return NextResponse.json({...result,outbox,inboxes},{headers})
  }catch{return NextResponse.json({message:'Monitor run failed'},{status:500,headers})}
}
