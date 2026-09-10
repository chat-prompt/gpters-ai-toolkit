/** Operator-only Slack delivery; a receipt is API acceptance, never a read receipt. */
import { createHash } from 'node:crypto'
export type DeliveryResult = { status:'accepted'; receipt:string } | {status:'retry'|'uncertain'|'blocked'|'cancelled'; reason:string; retryAfterSeconds?:number}
export type BeforeSendDecision = {status:'allow'} | {status:'cancel'|'retry';reason:string}
export type MonitorDeliveryEnvironment = Record<string,string|undefined>
export interface MonitorDeliveryOptions {
  beforeSend?:()=>Promise<BeforeSendDecision>
  deadlineAt?:number
  /** Injectable clock for bounded mock tests; production uses Date.now. */
  now?:()=>number
}
export function monitorDeliveryConfigured(env:MonitorDeliveryEnvironment=process.env): boolean {
  return env.AX_MONITOR_ALERTS_ENABLED==='true' && !!env.AX_MONITOR_SLACK_TOKEN && /^[UW][A-Z0-9]{8,20}$/.test(env.AX_MONITOR_SLACK_USER ?? '')
}
export async function deliverOperatorAlert(id:string,text:string,fetcher:typeof fetch=fetch,env:MonitorDeliveryEnvironment=process.env,options:MonitorDeliveryOptions={}):Promise<DeliveryResult> {
  if(!monitorDeliveryConfigured(env))return {status:'blocked',reason:'not-configured'}
  const clock=options.now??Date.now
  const deadline=options.deadlineAt??clock()+25000
  if(!Number.isFinite(deadline)||deadline-clock()<12000)return {status:'retry',reason:'insufficient-send-budget'}
  const recipient=env.AX_MONITOR_SLACK_USER,token=env.AX_MONITOR_SLACK_TOKEN
  const headers={Authorization:`Bearer ${env.AX_MONITOR_SLACK_TOKEN}`,'Content-Type':'application/json'}
  const call=async(method:string,body:unknown)=>fetcher(`https://slack.com/api/${method}`,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-clock())))})
  let channel:string
  try {
    const response=await call('conversations.open',{users:recipient,return_im:true})
    if(response.status===429)return {status:'retry',reason:'rate-limited',retryAfterSeconds:Math.min(86400,Math.max(60,Number(response.headers.get('retry-after'))||60))}
    const result=await response.json() as {ok?:boolean;channel?:{id?:string}}
    if(!response.ok||!result.ok||!/^D[A-Z0-9]{8,20}$/.test(result.channel?.id??''))return {status:'blocked',reason:'dm-unavailable'}
    channel=result.channel!.id!
  }catch{return {status:'retry',reason:'dm-open-failed'}}
  if(deadline-clock()<12000)return {status:'retry',reason:'insufficient-send-budget'}
  if(options.beforeSend) {
    // DM opening can take seconds. Recheck the durable claim and latest human
    // decision immediately before the actual message POST, not before DM lookup.
    let timer:ReturnType<typeof setTimeout>|undefined
    try {
      const guardTimeout=Math.max(1,Math.min(2000,deadline-clock()-10000))
      const decision=await Promise.race([options.beforeSend(),new Promise<BeforeSendDecision>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('pre-send timeout')),guardTimeout)
      })])
      if(decision.status!=='allow')return {status:decision.status==='cancel'?'cancelled':'retry',reason:decision.reason}
    }catch{return {status:'retry',reason:'pre-send-check-unavailable'}}
    finally{if(timer)clearTimeout(timer)}
  }
  // The final check and Slack POST cannot form a distributed transaction. A
  // decision made after this check may still race the send; API acceptance is
  // retained as evidence, and ambiguous POST results must never auto-retry.
  if(!monitorDeliveryConfigured(env)||env.AX_MONITOR_SLACK_USER!==recipient||env.AX_MONITOR_SLACK_TOKEN!==token)return {status:'cancelled',reason:'delivery-configuration-changed'}
  if(deadline-clock()<10000)return {status:'retry',reason:'insufficient-send-budget'}
  try {
    // Stable client ID assists reconciliation, but is not treated as exactly-once delivery.
    const hex=createHash('sha256').update(id).digest('hex').slice(0,32)
    const clientId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`
    const response=await call('chat.postMessage',{channel,text:text.slice(0,3500),mrkdwn:false,parse:'none',unfurl_links:false,unfurl_media:false,client_msg_id:clientId})
    if(response.status===429)return {status:'retry',reason:'rate-limited',retryAfterSeconds:Math.min(86400,Math.max(60,Number(response.headers.get('retry-after'))||60))}
    if(response.status>=500)return {status:'uncertain',reason:'upstream-uncertain'}
    const result=await response.json() as {ok?:boolean;ts?:string}
    if(!response.ok||!result.ok)return {status:'blocked',reason:'slack-rejected'}
    if(!/^\d+\.\d+$/.test(result.ts??''))return {status:'uncertain',reason:'missing-receipt'}
    return {status:'accepted',receipt:result.ts!}
  }catch{return {status:'uncertain',reason:'delivery-uncertain'}}
}
