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
    observedExecutionReports: [{ status: 'success', evidence: 'test', count: multiplier }],
    verifiedExecutions: { attempts: multiplier, success: multiplier, partial: 0, failed: 0, abandoned: 0, running: 0, withEvidence: multiplier },
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
    { source: 'hermes', status: 'reporting', lastCollectedAt: '2026-09-01T04:00:00.000Z', capabilities: { usage: true, tools: true, skills: false }, note: 'Hermes 수집' },
  ],
  models: [...BBODOONG.models, ...BBOKEOTER.models],
  tools: [...BBODOONG.tools, ...BBOKEOTER.tools],
  skills: BBODOONG.skills,
  observedExecutionReports: [{ status: 'success', evidence: 'test', count: 3 }],
  verifiedExecutions: { attempts: 3, success: 3, partial: 0, failed: 0, abandoned: 0, running: 0, withEvidence: 3 },
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
    expect(screen.getByText('이 소스에서는 아직 스킬 로드가 관측되지 않았습니다.')).toBeTruthy()
    expect(screen.getAllByText('Hermes')).toHaveLength(2)
    expect(screen.queryByText('Claude Code')).toBeNull()
  })

  it('핵심 지표의 의미를 클릭해서 확인할 수 있다', () => {
    render(<AgentActivityPanel data={DATA} days={7} />)
    const help = screen.getByLabelText('처리 토큰 설명')

    fireEvent.click(help)

    expect(screen.getByText(/입력·출력·캐시 생성·캐시 읽기를 합친 값/)).toBeTruthy()
  })
})
