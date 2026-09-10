'use client'

import { useState } from 'react'
import styles from './AgentMonitoringPanel.module.css'
import type { MonitorCaseState, MonitorDashboardData, MonitorKind } from '@/lib/features/ax'
import { monitorHeartbeat } from '../../../../../packages/lib/src/features/ax/monitor-health'
import type { AxPanelViewProps } from './types'

const STATES: Record<MonitorCaseState, string> = { candidate: '문제 후보', 'needs-info': '추가 확인 요청', reviewing: '검토 중', confirmed: '확정', 'false-positive': '오탐', fixed: '수정됨', verified: '관측 구간 검토 완료' }
const KINDS: Record<MonitorKind, string> = { 'task-failure': '작업 실패 관측', 'collector-stale': '수집 지연', 'missing-receipt': '기한 내 영수증 미관측' }
const EVIDENCE = { process: '프로세스 관측', api: 'API 응답', 'self-reported': '자체 보고' }
const CAPABILITIES = { observed: '관측 중', incomplete: '불완전', unavailable: '미수집' }
const PHASES = { task: '작업', search: '검색', 'search-skip': '검색 건너뜀', 'execution-report': '실행 보고 접수', 'skill-load': '스킬 조회', execution: '실행', verification: '검증', delivery: '전달', tool: '도구', 'read-guard': '읽기 차단', compaction: '컴팩션' }
const HEALTH = { waiting: '첫 점검 대기', healthy: '점검 동작 중', stale: '점검 지연', 'clock-skew': '점검 시각 확인 필요' }
const formatTime = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 없음'

/** Read-only view. Source health, monitor heartbeat and human decisions stay distinct. */
export function AgentMonitoringPanel({ data }: AxPanelViewProps<MonitorDashboardData>) {
  const [source, setSource] = useState('all')
  const [tvMode, setTvMode] = useState(false)
  const health = monitorHeartbeat(data.lastSuccessAt, data.checkedAt)
  const candidates = data.candidates.filter(item => source === 'all' || item.source === source)
    .sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || Number(b.observationActive) - Number(a.observationActive) || Date.parse(b.lastObservedAt) - Date.parse(a.lastObservedAt))
  const visibleCandidates = tvMode ? candidates.slice(0, 6) : candidates
  const attention = health !== 'healthy' || data.backlog > 0
  return <section aria-labelledby="agent-monitoring-heading" data-tv-mode={tvMode} className={`min-w-0 space-y-5 ${tvMode ? 'min-h-[75vh] rounded-lg bg-[var(--bg-primary)] p-4 sm:p-6' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="agent-monitoring-heading" className={`${tvMode ? 'text-2xl' : 'text-sm'} font-semibold text-[var(--text-primary)]`}>지속 점검</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]" title="실패·수집 지연·명시한 기한 내 영수증 누락은 검토할 후보입니다. 원천 관측만으로 사고를 확정하거나 사람이 내린 판정을 변경하지 않습니다.">관측 신호와 검토 판정을 함께 확인합니다. ⓘ</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
      <button type="button" aria-pressed={tvMode} onClick={() => setTvMode(!tvMode)} className="rounded border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]">{tvMode ? '일반 보기' : 'TV 모드'}</button>
      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">소스
        <select aria-label="점검 소스" value={source} onChange={event => setSource(event.target.value)} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2">
          <option value="all">전체 소스</option>
          {[...new Set(data.candidates.map(item => item.source))].sort().map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-4 rounded border border-[var(--border-subtle)] p-4 sm:grid-cols-3">
      <div><p className="text-xs text-[var(--text-secondary)]">감시자 상태</p><p className={`mt-1 ${tvMode ? 'text-2xl' : 'text-sm'} font-semibold ${attention ? styles.attention : 'text-[var(--text-primary)]'}`} title="마지막 중앙 점검 성공 후 15분을 넘으면 지연입니다. 에이전트의 업무 성공 여부와는 별개입니다.">{HEALTH[health]}</p><p className="mt-1 break-words text-xs text-[var(--text-secondary)]">성공 {formatTime(data.lastSuccessAt)}</p></div>
      <div><p className="text-xs text-[var(--text-secondary)]">처리 대기 배치</p><p className={`mt-1 ${tvMode ? 'text-3xl' : 'text-sm'} font-semibold text-[var(--text-primary)]`}>{data.backlog.toLocaleString('ko-KR')}개</p><p className="mt-1 text-xs text-[var(--text-secondary)]">대기 기록은 아직 판정하지 않았습니다.</p></div>
      <div><p className="text-xs text-[var(--text-secondary)]">발송 대기 알림</p><p className={`mt-1 ${tvMode ? 'text-3xl' : 'text-sm'} font-semibold text-[var(--text-primary)]`}>{data.alertsPending.toLocaleString('ko-KR')}개</p><p className="mt-1 text-xs text-[var(--text-secondary)]">발송 완료와 수신 확인은 별도입니다.</p></div>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]">
      <span>작업 이벤트 {CAPABILITIES[data.capabilities.taskEvents]}</span>
      <span title="독립 영수증이 없는 자체 보고를 실제 검증·전달 성공으로 바꾸지 않습니다.">독립 영수증 {CAPABILITIES[data.capabilities.independentReceipts]}</span>
      <span>서버 조회 {formatTime(data.checkedAt)}</span>
    </div>
    {(data.alertsUncertain ?? 0) > 0 && <p role="status" className={`text-sm ${styles.attention}`}>발송 결과 미확인 {data.alertsUncertain}개 · 중복 전송을 피하기 위해 수신 여부 확인이 필요합니다.</p>}
    {(data.alertsBlocked ?? 0) > 0 && <p role="status" className={`text-sm ${styles.attention}`}>발송 차단 {data.alertsBlocked}개 · 연결 설정을 확인해야 합니다.</p>}
    {(data.totalCandidates ?? data.candidates.length) > data.candidates.length && <p className={`text-xs ${styles.attention}`}>전체 {data.totalCandidates}개 중 {data.candidates.length}개를 표시합니다. 화면 목록 제한은 중앙 처리 범위와 다릅니다.</p>}
    {tvMode && candidates.length > visibleCandidates.length && <p className="text-xs text-[var(--text-secondary)]">TV 모드는 선택한 소스의 우선 확인 후보 {visibleCandidates.length}개를 표시합니다. 전체 목록은 일반 보기에서 확인하세요.</p>}
    {candidates.length === 0 ? <p className="border-l-2 border-[var(--border-subtle)] py-3 pl-4 text-sm text-[var(--text-secondary)]">표시할 문제 후보가 없습니다. 수집 범위 밖의 업무는 판정하지 않습니다.</p> : <ul className="divide-y divide-[var(--border-subtle)]">
      {visibleCandidates.map(item => <li key={item.id} className="min-w-0 py-4">
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${tvMode ? 'text-xl' : 'text-sm'}`}>
          <span className="font-medium text-[var(--text-primary)]">{KINDS[item.kind]}</span>
          <span className="text-xs text-[var(--text-secondary)]">{STATES[item.state]}</span>
          {item.needsReview && <span className={`text-xs font-medium ${styles.attention}`}>새 근거 · 재검토 필요</span>}
          <span className="text-xs text-[var(--text-secondary)]">{item.observationActive ? '관측 신호 있음' : '관측 신호 해제'}</span>
        </div>
        <p className="mt-2 break-all text-xs text-[var(--text-secondary)]">{item.agentId} · {item.source}{item.phase ? ` · ${PHASES[item.phase]}` : ''}{item.evidence ? ` · ${EVIDENCE[item.evidence]}` : ''}</p>
        <p className="mt-1 break-words text-xs text-[var(--text-secondary)]">처음 관측 {formatTime(item.firstObservedAt)} · 최근 확인 {formatTime(item.lastObservedAt)}{item.eventCount > 0 ? ` · 실패 이벤트 ${item.eventCount}건` : ''}</p>
        {item.taskId && <p className="mt-1 break-all font-mono text-[11px] text-[var(--text-secondary)]">작업 {item.taskId}</p>}
      </li>)}
    </ul>}
  </section>
}
