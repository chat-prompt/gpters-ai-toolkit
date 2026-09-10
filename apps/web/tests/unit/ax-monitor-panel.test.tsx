import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentMonitoringPanel } from '../../components/ax/panels/AgentMonitoringPanel'
import type { MonitorCandidate, MonitorDashboardData } from '../../../../packages/lib/src/features/ax/monitor-types'

const candidate: MonitorCandidate = { id: 'example', kind: 'task-failure', agentId: 'example-agent', source: 'codex',
  phase: 'execution-report', evidence: 'self-reported', state: 'verified', firstObservedAt: '2026-01-01T00:00:00Z',
  lastObservedAt: '2026-01-03T00:00:00Z', lastEventAt: '2026-01-03T00:00:00Z', eventCount: 2, observationActive: true, needsReview: true }
function data(overrides: Partial<MonitorDashboardData> = {}): MonitorDashboardData {
  return { lastSuccessAt: '2026-01-03T00:00:00Z', checkedAt: '2026-01-03T00:16:00Z', backlog: 5,
    alertsPending: 1, candidates: [candidate], capabilities: { taskEvents: 'observed', independentReceipts: 'unavailable' }, ...overrides }
}

describe('agent monitoring panel', () => {
  it('distinguishes stale watcher, backlog, uncollected receipts and operator decision', () => {
    render(<AgentMonitoringPanel data={data()} days={7} />)
    expect(screen.getByText('점검 지연')).toBeTruthy()
    expect(screen.getByText('5개')).toBeTruthy()
    expect(screen.getByText('독립 영수증 미수집')).toBeTruthy()
    expect(screen.getByText('관측 구간 검토 완료')).toBeTruthy()
    expect(screen.getByText('새 근거 · 재검토 필요')).toBeTruthy()
    expect(screen.getByText(/실행 보고 접수 · 자체 보고/)).toBeTruthy()
    expect(screen.queryByText('업무 정상')).toBeNull()
  })

  it('filters sources and discloses a limited UI view without implying incomplete processing', () => {
    render(<AgentMonitoringPanel data={data({ totalCandidates: 300, candidates: [candidate, { ...candidate, id: 'second', source: 'hermes', agentId: 'second-agent' }] })} days={7} />)
    expect(screen.getByText(/전체 300개 중 2개/)).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '점검 소스' }), { target: { value: 'hermes' } })
    expect(screen.getByText(/second-agent · hermes/)).toBeTruthy()
    expect(screen.queryByText(/example-agent · codex/)).toBeNull()
  })

  it('does not describe absent observations as zero incidents', () => {
    render(<AgentMonitoringPanel data={data({ lastSuccessAt: null, candidates: [], backlog: 0 })} days={7} />)
    expect(screen.getByText('첫 점검 대기')).toBeTruthy()
    expect(screen.getByText(/수집 범위 밖의 업무는 판정하지 않습니다/)).toBeTruthy()
    expect(screen.queryByText('사고 없음')).toBeNull()
  })

  it('offers an explicit TV subset and keeps uncertain delivery visible', () => {
    render(<AgentMonitoringPanel data={data({ alertsUncertain: 2, candidates: Array.from({ length: 8 }, (_, i) => ({ ...candidate, id: String(i), agentId: `agent-${i}` })) })} days={7} />)
    fireEvent.click(screen.getByRole('button', { name: 'TV 모드' }))
    expect(screen.getByRole('button', { name: '일반 보기' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/우선 확인 후보 6개/)).toBeTruthy()
    expect(screen.getAllByText('작업 실패 관측')).toHaveLength(6)
    expect(screen.getByText(/발송 결과 미확인 2개/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '일반 보기' }))
    expect(screen.getAllByText('작업 실패 관측')).toHaveLength(8)
  })
})
