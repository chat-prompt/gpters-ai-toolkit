import { panelOk,panelError,panelNotConfigured } from './panel'
import type { AxPanel } from './types'
import type { MonitorDashboardData } from './monitor-types'
import { readAgentMonitor } from './monitor-store'
const meta={id:'agent-monitoring',title:'지속 감시',description:'자동 감시·미검토 후보·알림 상태',source:'수집 배치 · 중앙 감시',visibility:'admin' as const,parentId:'skill-usage',usesPeriod:false}
export const agentMonitoringPanel:AxPanel<MonitorDashboardData>={meta,async load(ctx){
  if(!ctx.isAdmin)return panelError(meta,'관리자만 조회할 수 있습니다')
  try{const data=await readAgentMonitor();return data?panelOk(meta,data):panelNotConfigured(meta,'중앙 감시 연결을 준비 중입니다')}
  catch{return panelError(meta,'중앙 감시 상태를 조회하지 못했습니다')}
}}

const historyMeta={id:'incident-history',title:'문제 이력',description:'저장된 보고와 검토 이력',source:'검토 원장',visibility:'admin' as const,parentId:'skill-usage',usesPeriod:false}
export const incidentHistoryPanel:AxPanel<Record<string,never>>={meta:historyMeta,async load(ctx){return ctx.isAdmin?panelOk(historyMeta,{}):panelError(historyMeta,'관리자만 조회할 수 있습니다')}}

const observationMeta={id:'agent-observations',title:'사용 관측',description:'소스별 사용량 추세와 변경 전후 비교',source:'수집된 관측 지표',visibility:'admin' as const,parentId:'skill-usage',usesPeriod:true}
export const agentObservationPanel:AxPanel<Record<string,never>>={meta:observationMeta,async load(ctx){return ctx.isAdmin?panelOk(observationMeta,{}):panelError(observationMeta,'관리자만 조회할 수 있습니다')}}
