/**
 * AX 대시보드 — 클라이언트 화면 (EDU-11519)
 *
 * 구성원 × 구독 표는 사람 단위로 묶고, 묶음끼리는 그 사람의 가장 가까운 결제일 순이다.
 * 서비스 비중 게이지는 항목마다 Claude Code 몫을 보여준다.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxClientUsageData, AxMemberServiceRow } from '../../../../packages/lib/src/features/ax/types'
import { ClientUsagePanel } from '../../components/ax/panels/ClientUsagePanel'

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

    const rows = within(screen.getAllByRole('table')[1]).getAllByRole('row').slice(1)
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
