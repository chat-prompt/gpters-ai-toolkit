/**
 * AX 대시보드 — 클라이언트 화면 (EDU-11519)
 *
 * 구성원 × 구독 표는 사람 단위로 묶는다. 기본은 이름순, 결제 임박순이면 묶음끼리 그 사람의 가장 가까운 결제일 순이다.
 * 평소 설명은 "?" 도움말에 두고, 상태 경고(구독 조회 실패·시트 갱신 지연)와 빈 화면의 기준 시각은 펼쳐 둔다.
 * 서비스 비중 게이지는 항목마다 Claude Code 몫을 보여준다.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxClientUsageData, AxMemberServiceRow } from '../../../../packages/lib/src/features/ax/types'
import { ClientUsagePanel, compareVersions, formatShare, gaugeSegments } from '../../components/ax/panels/ClientUsagePanel'

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
  // 결제일순으로 흩어진 입력 — 홍길동의 Claude(D-2)와 Codex(D-20) 사이에 김철수(D-5)가 끼어 있다
  const scattered = () => [
    person('홍길동', 'Claude Code', 2),
    person('김철수', 'Claude Code', 5),
    person('홍길동', 'Codex', 20),
  ]
  const peopleCells = () => {
    const table = screen.getAllByRole('table').find((element) => within(element).queryByText('다음 결제'))!
    return within(table).getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent))
  }

  it('구성원 줄은 기본이 이름순이고 사람 단위로 묶는다', () => {
    render(<ClientUsagePanel days={7} data={data(scattered())} />)
    expect(screen.getByRole('button', { name: '이름순' })).toHaveAttribute('aria-pressed', 'true')
    expect(peopleCells()).toEqual([
      ['김철수', 'Claude Code Pro'],
      ['홍길동', 'Claude Code Pro'],
      ['', 'Codex Pro'],
    ])
  })

  it('결제 임박순이면 묶음은 그 사람의 가장 가까운 결제일 순이다', () => {
    render(<ClientUsagePanel days={7} data={data(scattered())} />)
    fireEvent.click(screen.getByRole('button', { name: '결제 임박순' }))
    expect(peopleCells()).toEqual([
      ['홍길동', 'Claude Code Pro'],
      ['', 'Codex Pro'],
      ['김철수', 'Claude Code Pro'],
    ])
  })

  it('읽는 법·기준 시각은 도움말로 들어가고, 시트 반영 기록이 없으면 경고는 늘 보인다', () => {
    render(<ClientUsagePanel days={7} data={data([person('홍길동', 'Claude Code', 2)])} />)
    expect(screen.getByRole('button', { name: '서비스 비중 기준' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주기 평균 기준' })).toBeInTheDocument()
    // data() 의 syncedAt 은 null — 갱신 이력 없음은 상태 경고라 도움말 밖에도 한 번 더 보인다
    expect(screen.getAllByText('구독 시트 갱신 이력 없음')).toHaveLength(2)
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

describe('도움말과 늘 보이는 경고', () => {
  const recent = () => new Date(Date.now() - 2 * 86_400_000).toISOString()

  it('시트가 최근에 반영됐으면 반영일은 도움말 안에만 있다', () => {
    const base = data([person('홍길동', 'Claude Code', 2)])
    render(<ClientUsagePanel days={7} data={{ ...base, subscriptions: { ...base.subscriptions!, syncedAt: recent() } }} />)
    expect(screen.getAllByText(/구독 시트 반영/)).toHaveLength(1)
    expect(screen.getByText(/구독 시트 반영/).closest('[role=tooltip]')).not.toBeNull()
  })

  it('구독을 못 읽으면 실패 안내는 도움말 밖에 보인다', () => {
    render(<ClientUsagePanel days={7} data={{ ...data([]), subscriptions: null }} />)
    expect(screen.getByText('구독 데이터를 불러오지 못했습니다').closest('[role=tooltip]')).toBeNull()
  })

  it('사용량·구독이 모두 비면 집계 구간·활성 보고를 펼쳐 둔다 — 수집 누락과 실제 0건을 가르는 근거', () => {
    const base = data([])
    render(<ClientUsagePanel days={7} data={{ ...base, byClient: [], subscriptions: { ...base.subscriptions!, byVendor: [], syncedAt: recent() } }} />)
    const notice = screen.getByText(/활성 보고/)
    expect(notice.closest('[role=tooltip]')).toBeNull()
    expect(screen.getByText('수집된 사용량과 등록된 구독이 없습니다.')).toBeInTheDocument()
  })
})

describe('도움말 닫기와 오래된 시트 경고', () => {
  it('Esc 로 닫히고(포인터를 올린 채여도), 포인터가 떠나면 다시 열 수 있다', () => {
    render(<ClientUsagePanel days={7} data={data([person('홍길동', 'Claude Code', 2)])} />)
    const button = screen.getByRole('button', { name: '서비스 비중 기준' })
    const tooltip = document.getElementById(button.getAttribute('aria-describedby')!)!
    fireEvent.mouseEnter(button.parentElement!)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(tooltip).toHaveAttribute('data-dismissed', 'true')
    fireEvent.mouseLeave(button.parentElement!)
    expect(tooltip).not.toHaveAttribute('data-dismissed')
  })

  it('Esc 는 열린 도움말만 닫는다 — 다른 도움말은 처음 열 때 그대로 나타난다', () => {
    render(<ClientUsagePanel days={7} data={data([person('홍길동', 'Claude Code', 2)])} />)
    const tooltipOf = (name: string) => {
      const button = screen.getByRole('button', { name })
      return { button, tooltip: document.getElementById(button.getAttribute('aria-describedby')!)! }
    }
    const first = tooltipOf('서비스 비중 기준')
    const second = tooltipOf('주기 평균 기준')
    fireEvent.mouseEnter(first.button.parentElement!)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(first.tooltip).toHaveAttribute('data-dismissed', 'true')
    expect(second.tooltip).not.toHaveAttribute('data-dismissed')
  })

  it('데이터가 있어도 시트가 31일 넘게 지났으면 경고는 도움말 밖에 보인다', () => {
    const base = data([person('홍길동', 'Claude Code', 2)])
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
    render(<ClientUsagePanel days={7} data={{ ...base, subscriptions: { ...base.subscriptions!, syncedAt: old } }} />)
    const outside = screen.getAllByText(/40일 지남/).filter((element) => !element.closest('[role=tooltip]'))
    expect(outside).toHaveLength(1)
  })
})

describe('수집 참여 상태 aitk 열', () => {
  it('팀 최고 버전보다 낮은 마지막 관측 버전만 주황색이다', () => {
    const participant = (userId: string, aitkVersion: string | null) => ({
      userId, memberName: userId, status: 'reporting' as const, lastReportedAt: null, lastLoginAt: null,
      aitkVersion, clients: [], source: 'collector' as const,
    })
    render(
      <ClientUsagePanel
        data={{
          ...data([]),
          participation: [participant('최신', '0.7.24'), participant('구버전', '0.7.9 이하'), participant('모름', null)],
        }}
        days={7}
      />
    )
    expect(screen.getByText('0.7.24').className).not.toContain('accent-orange')
    expect(screen.getByText('0.7.9 이하').className).toContain('accent-orange')
  })
})

describe('compareVersions', () => {
  it('자리마다 숫자로 비교한다', () => {
    expect(compareVersions('0.7.9', '0.7.24')).toBeLessThan(0)
    expect(compareVersions('0.8.0', '0.7.24')).toBeGreaterThan(0)
    expect(compareVersions('0.7.24', '0.7.24')).toBe(0)
    expect(compareVersions('0.7', '0.7.0')).toBe(0)
    // User-Agent 이전 aitk 표시는 0.7.9로 읽힌다
    expect(compareVersions('0.7.9 이하', '0.7.10')).toBeLessThan(0)
  })
})
