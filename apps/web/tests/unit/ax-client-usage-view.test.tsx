/**
 * AX 대시보드 — 클라이언트 화면 (EDU-11519)
 *
 * 구성원 × 구독 표는 사람 단위로 묶고, 묶음끼리는 그 사람의 가장 가까운 결제일 순이다.
 * 서비스 비중 게이지는 항목마다 Claude Code 몫을 보여준다.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxClientUsageData, AxMemberServiceRow } from '../../../../packages/lib/src/features/ax/types'
import { ClientUsagePanel, formatShare, gaugeSegments } from '../../components/ax/panels/ClientUsagePanel'

const person = (name: string, service: string, daysLeft: number | null): AxMemberServiceRow => ({
  name,
  service,
  trackable: true,
  subscription: daysLeft === null ? null : {
    vendor: service === 'Codex' ? 'OpenAI' : 'Anthropic', plan: 'Pro', amount: 100, currency: 'USD', payer: '본인',
    shared: false, nextRenewal: '2026-10-25', daysLeft,
  },
  cycleWeeks: [],
  cycleAveragePercent: null,
  usage: { plan: null, totalTokens: 10, sessions: 1, limitUsedPercent: 10, limitResetsAt: null, lastReportedAt: '2026-10-19T00:00:00.000Z' },
})

function data(people: AxMemberServiceRow[]): AxClientUsageData {
  return {
    syncedAt: null, periodStart: null, periodEnd: null, reportingMembers: 2, internalMembers: null, totalTokens: 400,
    byClient: [
      { client: 'claude-code', members: 3, totalTokens: 300, sessions: 30, reportsLimit: true, avgLimitUsedPercent: 40 },
      { client: 'codex', members: 1, totalTokens: 100, sessions: 10, reportsLimit: true, avgLimitUsedPercent: 10 },
    ],
    byModel: [],
    members: null,
    participation: null,
    subscriptions: {
      syncedAt: null, activeSeats: 4, monthlyByCurrency: { USD: 400 },
      byVendor: [
        { vendor: 'Anthropic', seats: 3, monthlyByCurrency: { USD: 300 } },
        { vendor: 'OpenAI', seats: 1, monthlyByCurrency: { USD: 100 } },
      ],
      members: null,
    },
    people,
    peopleError: false,
    cycleError: false,
  }
}

describe('클라이언트 화면', () => {
  it('구성원 줄을 사람 단위로 묶고, 묶음은 그 사람의 가장 가까운 결제일 순이다', () => {
    render(<ClientUsagePanel days={7} data={data([
      // 결제일순으로 흩어진 입력 — 홍길동의 Claude(D-2)와 Codex(D-20) 사이에 김철수(D-5)가 끼어 있다
      person('홍길동', 'Claude Code', 2),
      person('김철수', 'Claude Code', 5),
      person('홍길동', 'Codex', 20),
    ])} />)

    const table = screen.getAllByRole('table').find((element) => within(element).queryByText('다음 결제'))!
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent))).toEqual([
      ['홍길동', 'Claude Code Pro'],
      ['', 'Codex Pro'],
      ['김철수', 'Claude Code Pro'],
    ])
  })

  it('서비스 비중 게이지는 항목마다 Claude Code 몫과 두 값을 함께 보여준다', () => {
    render(<ClientUsagePanel days={7} data={data([])} />)
    expect(screen.getByRole('img', { name: /좌석 · Claude Code 3 \(75%\) · Codex 1 \(25%\)/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /토큰 · Claude Code 300 \(75%\)/ })).toBeInTheDocument()
  })
})

describe('월 비용 게이지', () => {
  const withVendors = (byVendor: NonNullable<AxClientUsageData['subscriptions']>['byVendor']) => {
    const base = data([])
    return { ...base, subscriptions: { ...base.subscriptions!, byVendor } }
  }

  it('한쪽에만 구독이 있으면 그 통화로 100% 를 그린다', () => {
    render(<ClientUsagePanel days={7} data={withVendors([{ vendor: 'Anthropic', seats: 3, monthlyByCurrency: { USD: 300 } }])} />)
    expect(screen.getByRole('img', { name: /월 비용 · Claude Code US\$300 \(100%\)/ })).toBeInTheDocument()
  })

  it('통화가 섞인 쪽이 있으면 0으로 바꾸지 않고 비용 게이지를 뺀다', () => {
    render(<ClientUsagePanel days={7} data={withVendors([
      { vendor: 'Anthropic', seats: 3, monthlyByCurrency: { USD: 300, KRW: 20000 } },
      { vendor: 'OpenAI', seats: 1, monthlyByCurrency: { USD: 100 } },
    ])} />)
    expect(screen.queryByRole('img', { name: /월 비용/ })).toBeNull()
  })
})

describe('서비스 비중 게이지 기하', () => {
  it('작은 몫도 조각이 사라지지 않는다 — 1:99, 3:97, 97:3, 99:1', () => {
    for (const share of [0.01, 0.03, 0.97, 0.99]) {
      const segments = gaugeSegments(share)
      expect(segments).toHaveLength(2)
      for (const segment of segments) expect(segment.to - segment.from).toBeGreaterThan(0)
      // 두 조각 사이 틈이 남는다
      expect(segments[1].from).toBeGreaterThan(segments[0].to)
    }
  })

  it('0% 와 100% 는 한 조각으로 반원 전체를 채운다', () => {
    expect(gaugeSegments(0)).toEqual([{ client: 'codex', from: 0, to: 1 }])
    expect(gaugeSegments(1)).toEqual([{ client: 'claude-code', from: 0, to: 1 }])
  })

  it('0·100 에 붙은 양수 몫을 0%·100% 로 쓰지 않는다', () => {
    expect(formatShare(0.004)).toBe('<1%')
    expect(formatShare(0.996)).toBe('>99%')
    expect(formatShare(0.995)).toBe('>99%')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(0.61)).toBe('61%')
  })
})
