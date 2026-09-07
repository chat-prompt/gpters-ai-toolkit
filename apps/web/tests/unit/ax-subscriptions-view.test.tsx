/**
 * AX 대시보드 — 구독 현황 화면의 "오래된 자료" 경고 테스트
 *
 * 구독 데이터는 결제내역 시트에서 사람이 옮기는 사본이고, 갱신 주기가 월 1회로 확정됐다
 * (DEV-4319). 경고 기준이 그 주기보다 짧으면 매달 후반 내내 켜져 있어 신호 구실을 못 한다.
 * 그래서 "주기 안"과 "주기를 넘김"을 가르는 경계를 테스트로 못 박는다.
 */

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxSubscriptionData } from '../../../../packages/lib/src/features/ax/types'
import { SubscriptionsPanel } from '../../components/ax/panels/SubscriptionsPanel'

/** 화면이 "지금"으로 삼는 기준 시각 — 테스트 내내 고정한다 */
const NOW = new Date('2026-09-07T00:00:00.000Z')

/**
 * 마지막 시트 반영이 `daysAgo`일 전인 최소 데이터
 *
 * @param daysAgo - 며칠 전에 반영됐는지
 * @returns 패널에 넘길 구독 데이터
 */
function dataSyncedDaysAgo(daysAgo: number): AxSubscriptionData {
  const syncedAt = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    syncedAt: syncedAt.toISOString(),
    activeSeats: 3,
    monthlyByCurrency: { KRW: 90000 },
    byVendor: [{ vendor: 'Anthropic', seats: 3, monthlyByCurrency: { KRW: 90000 } }],
    members: null,
  }
}

describe('구독 현황 — 시트 반영 경고', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('월 1회 갱신 주기 안(20일 전)이면 "지남"을 붙이지 않는다', () => {
    render(<SubscriptionsPanel data={dataSyncedDaysAgo(20)} days={7} />)
    expect(screen.queryByText(/지남/)).toBeNull()
  })

  it('30일 전은 아직 주기 안이다 — 14일 기준이면 여기서 잘못 경고했다', () => {
    render(<SubscriptionsPanel data={dataSyncedDaysAgo(30)} days={7} />)
    expect(screen.queryByText(/지남/)).toBeNull()
  })

  it('31일을 넘기면 며칠 지났는지 알린다', () => {
    render(<SubscriptionsPanel data={dataSyncedDaysAgo(35)} days={7} />)
    expect(screen.getByText(/35일 지남/)).toBeInTheDocument()
  })

  it('갱신 이력이 아예 없으면 그렇게 말한다 — 0일 지남이 아니다', () => {
    render(
      <SubscriptionsPanel
        data={{ ...dataSyncedDaysAgo(1), syncedAt: null }}
        days={7}
      />
    )
    expect(screen.getByText('갱신 이력 없음')).toBeInTheDocument()
  })
})
