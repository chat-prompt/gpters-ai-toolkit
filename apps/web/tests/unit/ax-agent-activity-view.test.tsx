import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  AxAgentActivityAgentRow,
  AxAgentActivityData,
  AxAgentReporterRow,
  AxAgentTokenUsage,
} from '../../../../packages/lib/src/features/ax/types'
import { AgentActivityPanel } from '../../components/ax/panels/AgentActivityPanel'

function usage(multiplier = 1): AxAgentTokenUsage {
  return {
    inputTokens: 10 * multiplier,
    outputTokens: 20 * multiplier,
    cacheCreationInputTokens: 30 * multiplier,
    cacheReadInputTokens: 40 * multiplier,
    thinkingTokens: 8 * multiplier,
    thinkingTokensRelation: 'included-in-output',
  }
}

function reporter(agentId: string, source: AxAgentReporterRow['source'], multiplier: number): AxAgentReporterRow {
  return {
    agentId,
    source,
    collectorId: `${agentId}-${source}`,
    managed: true,
    intervalSeconds: 3600,
    lastCollectedAt: '2026-09-01T04:00:00.000Z',
    freshnessHours: 0.5,
    freshness: 'fresh',
    healthStatus: 'healthy',
    sessions: multiplier,
    turns: 4 * multiplier,
    usage: usage(multiplier),
    toolCalls: 5 * multiplier,
    toolFailures: 0,
    healthWarnings: [],
  }
}

function agent(
  agentId: string,
  model: string,
  tool: string,
  skill: string | null,
  multiplier: number,
): AxAgentActivityAgentRow {
  return {
    agentId,
    totalUsage: usage(multiplier),
    totalProcessedTokens: 100 * multiplier,
    sessions: multiplier,
    turns: 4 * multiplier,
    toolCalls: 5 * multiplier,
    toolFailures: 0,
    models: [{ model, turns: 4 * multiplier, usage: usage(multiplier), processedTokens: 100 * multiplier }],
    tools: [{ name: tool, calls: 5 * multiplier, failures: 0, failureRate: 0 }],
    skills: skill ? [{ skillId: skill, loaded: multiplier, failed: 0, interrupted: 0 }] : [],
    uniqueLoadedSkills: skill ? 1 : 0,
    skillLoadsObserved: skill !== null,
    observedExecutionReports: [{ status: 'success', evidence: 'test', count: multiplier }],
    verifiedExecutions: {
      attempts: multiplier,
      success: multiplier,
      partial: 0,
      failed: 0,
      abandoned: 0,
      running: 0,
      withEvidence: multiplier,
      uniqueSkills: 1,
      verifiedSkills: 1,
      linkedLoads: multiplier,
      linkedVerifiedSuccesses: multiplier,
    },
    collection: { batches: multiplier, recordsRead: 100 * multiplier, parseFailures: 0, unsupportedRecordsSkipped: 0 },
  }
}

const BBODOONG = agent('bbodoong', 'claude-opus-5', 'Bash', 'browse', 2)
const BBOKEOTER = agent('bbokeoter', 'hermes-3', 'shell', null, 1)
const REPORTERS = [reporter('bbodoong', 'claude-code', 2), reporter('bbokeoter', 'hermes', 1)]

const DATA: AxAgentActivityData = {
  syncedAt: '2026-09-01T04:00:00.000Z',
  windowStart: '2026-08-26T00:00:00.000Z',
  windowEnd: '2026-09-01T04:00:00.000Z',
  totalUsage: usage(3),
  totalProcessedTokens: 300,
  sessions: 3,
  turns: 12,
  toolCalls: 15,
  toolFailures: 0,
  agents: [BBODOONG, BBOKEOTER],
  reporters: REPORTERS,
  sourceCoverage: [
    { source: 'openclaw', status: 'alternate', lastCollectedAt: null, capabilities: { usage: true, tools: false, skills: false }, note: '요약 로그' },
    { source: 'claude-code', status: 'reporting', lastCollectedAt: '2026-09-01T04:00:00.000Z', capabilities: { usage: true, tools: true, skills: true }, note: '정밀 수집' },
    { source: 'codex', status: 'missing', lastCollectedAt: null, capabilities: { usage: true, tools: true, skills: false }, note: 'Codex 수집' },
    { source: 'hermes', status: 'reporting', lastCollectedAt: '2026-09-01T04:00:00.000Z', capabilities: { usage: true, tools: true, skills: true }, note: 'Hermes 수집' },
  ],
  models: [...BBODOONG.models, ...BBOKEOTER.models],
  tools: [...BBODOONG.tools, ...BBOKEOTER.tools],
  skills: BBODOONG.skills,
  uniqueLoadedSkills: 1,
  skillLoadsObserved: true,
  observedExecutionReports: [{ status: 'success', evidence: 'test', count: 3 }],
  verifiedExecutionsAvailable: true,
  verifiedExecutions: {
    attempts: 3,
    success: 3,
    partial: 0,
    failed: 0,
    abandoned: 0,
    running: 0,
    withEvidence: 3,
    uniqueSkills: 2,
    verifiedSkills: 2,
    linkedLoads: 3,
    linkedVerifiedSuccesses: 3,
  },
  collection: { batches: 3, recordsRead: 300, parseFailures: 0, unsupportedRecordsSkipped: 0 },
  insights: [],
}

describe('AgentActivityPanel', () => {
  it('에이전트를 선택하면 토큰·모델·도구·스킬·실행 결과를 함께 전환한다', () => {
    render(<AgentActivityPanel data={DATA} days={7} />)

    const selector = within(screen.getByRole('group', { name: '에이전트 선택' }))
    expect(selector.getByRole('button', { name: /전체/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('claude-opus-5')).toBeTruthy()
    expect(screen.getByText('hermes-3')).toBeTruthy()

    fireEvent.click(selector.getByRole('button', { name: /bbokeoter/ }))

    expect(selector.getByRole('button', { name: /bbokeoter/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('bbokeoter', { selector: '#agent-summary-title' })).toBeTruthy()
    expect(screen.queryByText('claude-opus-5')).toBeNull()
    expect(screen.getByText('hermes-3')).toBeTruthy()
    expect(screen.getByText('shell')).toBeTruthy()
    expect(screen.getByText('이 수집 소스는 스킬 로드 신호를 제공하지 않아 미관측입니다.')).toBeTruthy()
    expect(screen.getByText('미관측', { selector: 'p' })).toBeTruthy()
    // 연결 가능한 로드가 1회뿐이라 백분율 대신 분수를 참고 수치로 보여준다.
    expect(screen.queryByText('100.0%')).toBeNull()
    expect(screen.getByText('1/1 · 참고')).toBeTruthy()
    expect(screen.getByText('표본 10회 미만')).toBeTruthy()
    expect(screen.getAllByText('Hermes')).toHaveLength(2)
    expect(screen.queryByText('Claude Code')).toBeNull()
  })

  it('실행 결과 테이블이 없으면 검증 지표를 0이 아니라 미관측으로 보여준다', () => {
    render(<AgentActivityPanel data={{ ...DATA, verifiedExecutionsAvailable: false }} days={7} />)

    // 스킬 활용 4칸 중 검증에 기대는 3칸과 실행 결과 4칸이 모두 미관측이다.
    expect(screen.getAllByText('미관측', { selector: 'p' }).length).toBeGreaterThanOrEqual(7)
    expect(screen.getAllByText('실행 결과 계측 준비 중').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText('3개', { selector: 'p' })).toBeNull()
    expect(screen.queryByText('3/3 · 참고')).toBeNull()
    // 텔레메트리에서 직접 관측한 고유 로드 스킬은 그대로 보인다.
    expect(screen.getByText('1개', { selector: 'p' })).toBeTruthy()
  })

  it('핵심 지표의 설명은 기본 화면에 두지 않고 라벨에 호버·포커스했을 때 툴팁으로 보여준다', () => {
    render(<AgentActivityPanel data={DATA} days={7} />)

    // `?` 버튼은 없고, 설명은 칸 전체의 aria-describedby 툴팁이다.
    expect(screen.queryByLabelText('처리 토큰 설명')).toBeNull()
    // '처리 토큰'은 표 머리칸에도 있으므로 설명이 붙은 수치 칸만 고른다.
    const stat = screen.getAllByText('처리 토큰')
      .map((element) => element.closest('[aria-describedby]'))
      .find((element): element is HTMLElement => element !== null)!
    expect(stat.tabIndex).toBe(0)
    const tooltip = document.getElementById(stat.getAttribute('aria-describedby')!)!
    expect(tooltip.getAttribute('role')).toBe('tooltip')
    expect(tooltip.textContent).toContain('입력·출력·캐시 생성·캐시 읽기를 합친 값')
    // 기본 상태에서는 보이지 않고, 호버·포커스 때만 group 클래스로 드러난다.
    expect(tooltip.className).toContain('invisible')
    expect(tooltip.className).toContain('group-hover:visible')
    expect(tooltip.className).toContain('group-focus:visible')
  })
})
