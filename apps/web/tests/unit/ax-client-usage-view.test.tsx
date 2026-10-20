/**
 * AX 대시보드 — 클라이언트 화면 (EDU-11519)
 *
 * 구성원 × 구독 표는 사람 단위로 묶는다. 기본은 이름순, 결제 임박순이면 묶음끼리 그 사람의 가장 가까운 결제일 순이다.
 * 평소 설명은 "?" 도움말에 두고, 상태 경고(구독 조회 실패·시트 갱신 지연)와 빈 화면의 기준 시각은 펼쳐 둔다.
 * 서비스 비중 게이지는 항목마다 Claude Code 몫을 보여준다.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxClientUsageData, AxMemberServiceRow, AxUsageParticipationRow } from '../../../../packages/lib/src/features/ax/types'
import { ClientUsagePanel, compareVersions, limitCaptureLabel, formatShare, gaugeSegments } from '../../components/ax/panels/ClientUsagePanel'

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

describe('구성원 × 구독 표의 수집기 상태', () => {
  const participant = (
    memberName: string,
    aitkVersion: string | null,
    limitCapture: AxUsageParticipationRow['limitCapture'] = null
  ): AxUsageParticipationRow => ({
    userId: memberName, memberName, status: 'reporting', lastReportedAt: null, lastLoginAt: null,
    aitkVersion, clients: ['claude-code'], limitCapture, source: 'collector',
  })
  const noLimit = (name: string, service: string): AxMemberServiceRow => {
    const row = person(name, service, 3)
    return { ...row, usage: { ...row.usage!, limitUsedPercent: null } }
  }

  it('이름 아래 aitk 버전을 두고, 팀 최고 버전보다 낮으면 주황색이다 — 수집 참여 상태 표에는 없다', () => {
    render(
      <ClientUsagePanel
        data={{
          ...data([person('최신', 'Claude Code', 3), person('구버전', 'Claude Code', 3), person('모름', 'Claude Code', 3)]),
          participation: [participant('최신', '0.7.24'), participant('구버전', '0.7.9 이하'), participant('모름', null)],
        }}
        days={7}
      />
    )
    expect(screen.getByText('aitk 0.7.24').className).not.toContain('accent-orange')
    expect(screen.getByText('aitk 0.7.9 이하').className).toContain('accent-orange')
    expect(screen.getAllByText(/^aitk /)).toHaveLength(2)
    expect(screen.queryByRole('columnheader', { name: 'Claude 한도' })).toBeNull()
  })

  it('Claude Code 줄은 한도를 못 받으면 미수집 대신 연결 상태를 쓰고, Codex 줄은 그대로 미수집이다', () => {
    render(
      <ClientUsagePanel
        data={{
          ...data([noLimit('홍길동', 'Claude Code'), noLimit('홍길동', 'Codex'), noLimit('김철수', 'Claude Code')]),
          participation: [
            participant('홍길동', '0.7.25', { statusline: 'none', autoSetup: 'skipped:symlink', autoSetupAt: null, snapshotAt: null }),
            participant('김철수', '0.7.24'),
          ],
        }}
        days={7}
      />
    )
    expect(screen.getByText('미연결 · 설정 폴더가 심링크').className).toContain('accent-orange')
    expect(screen.getByText('상태 미보고')).toBeInTheDocument()
    expect(screen.getAllByText('미수집')).toHaveLength(1)
  })
  it('로스터 이름(별칭)도 계정 표시명과 잇고, 후보가 둘이거나 공용 구독이면 붙이지 않는다', () => {
    const shared = person('공용(팀)', 'Claude Code', 3)
    render(
      <ClientUsagePanel
        data={{
          ...data([
            { ...person('타타', 'Claude Code', 3), usage: null },
            person('김민수', 'Codex', 3),
            { ...shared, subscription: { ...shared.subscription!, shared: true } },
          ]),
          participation: [
            participant('조효희 (타타)', '0.7.24'),
            participant('김민수', '0.7.25'),
            participant('김민수 (둘째)', '0.7.20'),
            participant('공용(팀)', '0.7.9 이하'),
          ],
        }}
        days={7}
      />
    )
    expect(screen.getByText('aitk 0.7.24')).toBeInTheDocument()
    expect(screen.getAllByText(/^aitk /)).toHaveLength(1)
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

describe('limitCaptureLabel', () => {
  const NOW = Date.parse('2026-10-20T00:00:00Z')
  const capture = (overrides: Partial<NonNullable<AxUsageParticipationRow['limitCapture']>>) => ({
    statusline: 'aitk' as const, autoSetup: 'unchanged', autoSetupAt: null, snapshotAt: null, ...overrides,
  })
  const claude = (limitCapture: AxUsageParticipationRow['limitCapture'], lastReportedAt: string | null = null) => ({
    clients: ['claude-code' as const], limitCapture, lastReportedAt,
  })

  it('Claude Code를 안 쓰면 빈 칸, 옛 aitk면 실패로 단정하지 않는다', () => {
    expect(limitCaptureLabel({ clients: ['codex'], limitCapture: null, lastReportedAt: null }, NOW)).toBeNull()
    expect(limitCaptureLabel(claude(null), NOW)).toEqual({ label: '상태 미보고', warn: false })
  })

  it('최근 7일 안에 한도를 받았으면 수집 중, 연결만 됐으면 미수신', () => {
    expect(limitCaptureLabel(claude(capture({ snapshotAt: '2026-10-19T00:00:00Z' })), NOW)).toEqual({ label: '수집 중', warn: false })
    expect(limitCaptureLabel(claude(capture({ snapshotAt: '2026-10-01T00:00:00Z' })), NOW)).toEqual({ label: '연결됨 · 한도 미수신', warn: true })
  })

  it('연결이 안 됐으면 자동 연결을 건너뛴 이유를 붙인다', () => {
    expect(limitCaptureLabel(claude(capture({ statusline: 'user', autoSetup: 'skipped:symlink' })), NOW))
      .toEqual({ label: '미연결 · 설정 폴더가 심링크', warn: true })
    expect(limitCaptureLabel(claude(capture({ statusline: 'none', autoSetup: 'failed' })), NOW))
      .toEqual({ label: '미연결 · 연결 실패', warn: true })
    expect(limitCaptureLabel(claude(capture({ statusline: 'none', autoSetup: null })), NOW))
      .toEqual({ label: '미연결', warn: true })
  })

  it('지금 미연결이면 어제 받은 한도보다 미연결이 우선한다', () => {
    expect(limitCaptureLabel(claude(capture({ statusline: 'user', autoSetup: 'skipped:drifted', snapshotAt: '2026-10-19T00:00:00Z' })), NOW))
      .toEqual({ label: '미연결 · 연결 뒤 직접 되돌림', warn: true })
  })

  it('신선도는 상태를 받은 시각 기준이고, 연결 첫날은 경고하지 않는다', () => {
    // 10일 전 보고 때 하루 전 한도를 받았다 — 지금 보고가 끊겼어도 그때는 수집 중이었다
    expect(limitCaptureLabel(claude(capture({ snapshotAt: '2026-10-09T00:00:00Z', observedAt: '2026-10-10T00:00:00Z' }), '2026-10-10T00:00:00Z'), NOW))
      .toEqual({ label: '수집 중', warn: false })
    expect(limitCaptureLabel(claude(capture({ autoSetup: 'connected:wrapped', autoSetupAt: '2026-10-19T23:00:00Z', observedAt: '2026-10-19T23:00:05Z' })), NOW))
      .toEqual({ label: '연결됨 · 첫 수신 대기', warn: false })
    // 다음 날부터는 매일 unchanged가 새 시각으로 남는다 — 한 번도 못 받았으면 경고한다
    expect(limitCaptureLabel(claude(capture({ autoSetup: 'unchanged', autoSetupAt: '2026-10-21T00:00:00Z', observedAt: '2026-10-21T00:00:05Z' })), NOW))
      .toEqual({ label: '연결됨 · 한도 미수신', warn: true })
  })

  it('Codex 전용 머신이 마지막으로 보고해도 보존된 Claude 진단을 관측 날짜와 함께 보여준다', () => {
    const kept = capture({ statusline: 'user', autoSetup: 'skipped:symlink', observedAt: '2026-10-10T00:00:00Z' })
    expect(limitCaptureLabel({ clients: ['codex'], limitCapture: kept, lastReportedAt: '2026-10-19T00:00:00Z' }, NOW)?.label)
      .toMatch(/^미연결 · 설정 폴더가 심링크 \(.+ 관측\)$/)
  })

  it('마지막 보고보다 하루 넘게 이른 관측이면 관측 날짜를 붙인다 — 옛 aitk 보고가 이전 값을 남긴 경우', () => {
    const old = capture({ statusline: 'none', autoSetup: null, observedAt: '2026-10-10T00:00:00Z' })
    expect(limitCaptureLabel(claude(old, '2026-10-19T00:00:00Z'), NOW)?.label).toMatch(/^미연결 \(.+ 관측\)$/)
    expect(limitCaptureLabel(claude(old, '2026-10-10T12:00:00Z'), NOW)?.label).toBe('미연결')
  })
})
