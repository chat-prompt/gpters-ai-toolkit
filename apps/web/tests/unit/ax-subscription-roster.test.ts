/**
 * 구독 로스터 CSV → AX 구독 행 변환과 전체 동기화 계획 (DEV-4319)
 *
 * 정본이 「지니파이(주) 결제 내역」 `구독 로스터` 탭으로 바뀌어(EDU-10958) import 형식을 옮겼다.
 */
import { describe, expect, it } from 'vitest'
import {
  parseRosterCsv,
  planRosterSync,
  subscriptionKey,
  summarizeRosterSync,
  type ExistingSubscriptionValues,
} from '../../../../packages/db/scripts/lib/ax-subscription-roster'

const HEADER = 'name,slack_id,account,plan,price_usd,renewal_day,payer,card_last4'

describe('parseRosterCsv', () => {
  it('maps roster columns by name and drops alert-only columns', () => {
    const csv = [HEADER, '홍길동,U0123456789,anthropic,Max20x,200,6,본인,1234', '김철수,U0987654321,openai,Pro5x,100,14,현진우,5678'].join('\n')
    const { rows, errors } = parseRosterCsv(csv)

    expect(errors).toEqual([])
    expect(rows).toEqual([
      { vendor: 'Anthropic', plan: 'Max20x', ownerName: '홍길동', renewalDay: 6, payer: '본인', amount: 200, currency: 'USD', billingCycle: 'monthly', status: 'active' },
      { vendor: 'OpenAI', plan: 'Pro5x', ownerName: '김철수', renewalDay: 14, payer: '현진우', amount: 100, currency: 'USD', billingCycle: 'monthly', status: 'active' },
    ])
    // 카드 끝 4자리와 슬랙 ID 는 결과 어디에도 남지 않는다
    expect(JSON.stringify(rows)).not.toMatch(/1234|5678|U0123456789/)
  })

  it('finds columns by header name regardless of order, case, BOM and CRLF', () => {
    const csv = '﻿Payer,Price_USD,Plan,Account,Renewal_Day,Name\r\n본인,20,Pro,Anthropic,3,이영희\r\n'
    expect(parseRosterCsv(csv).rows[0]).toMatchObject({ vendor: 'Anthropic', plan: 'Pro', ownerName: '이영희', renewalDay: 3, amount: 20 })
  })

  it('refuses a sheet whose required columns are missing instead of half-reading it', () => {
    // 옛 결제내역 트래커 형식
    expect(() => parseRosterCsv('vendor,plan,owner_name,renewal_day,payer,amount,currency,billing_cycle,status,note\nA,B,C,1,본인,1,USD,monthly,active,')).toThrow(/필요한 열이 없습니다/)
  })

  it('skips bad rows with a reason and keeps the rest', () => {
    const csv = [
      HEADER,
      ',U1,anthropic,Max5x,100,1,본인,0000', // 이름 없음
      '갑,U2,google,Pro,20,1,본인,0000', // 모르는 서비스
      '을,U3,openai,Plus,abc,1,본인,0000', // 금액 아님
      '병,U4,openai,Plus,20,32,본인,0000', // 결제일 범위 밖
      '정,U5,openai,Plus,20,9,본인,0000',
      '정,U5,openai,Plus,20,9,본인,0000', // 같은 구독 두 번
    ].join('\n')
    const { rows, errors } = parseRosterCsv(csv)

    expect(rows.map((row) => row.ownerName)).toEqual(['정'])
    expect(errors).toHaveLength(5)
    expect(errors[1]).toContain('알 수 없는 account')
    expect(errors[4]).toContain('두 번')
  })

  it('treats a same-person same-plan subscription on another renewal day as a separate row', () => {
    const csv = [HEADER, '송,U1,anthropic,Max20x,200,11,본인,0000', '송,U1,anthropic,Max20x,200,27,본인,0000'].join('\n')
    expect(parseRosterCsv(csv).rows).toHaveLength(2)
  })
})

describe('planRosterSync', () => {
  const roster = parseRosterCsv([HEADER, '홍길동,U1,anthropic,Max20x,200,6,본인,0000', '김철수,U2,openai,Pro,100,14,본인,0000'].join('\n')).rows

  it('updates matching rows, inserts new ones and removes rows no longer on the roster', () => {
    const existing = [
      { id: 'keep', vendor: 'Anthropic', plan: 'Max20x', ownerName: '홍길동', renewalDay: 6 },
      { id: 'gone', vendor: 'Anthropic', plan: 'Max5x', ownerName: '퇴사자', renewalDay: 14 },
    ]
    const plan = planRosterSync(roster, existing)

    expect(plan.update).toEqual([{ id: 'keep', row: roster[0] }])
    expect(plan.insert).toEqual([roster[1]])
    expect(plan.remove.map((row) => row.id)).toEqual(['gone'])
  })

  it('keys on vendor, plan, owner and renewal day together', () => {
    expect(subscriptionKey({ vendor: 'OpenAI', plan: 'Pro', ownerName: 'a', renewalDay: 1 })).not.toBe(
      subscriptionKey({ vendor: 'Anthropic', plan: 'Pro', ownerName: 'a', renewalDay: 1 })
    )
  })
})

describe('summarizeRosterSync', () => {
  const existingRow = (id: string, ownerName: string, plan: string, renewalDay: number, amount = '200.00'): ExistingSubscriptionValues => ({
    id, vendor: 'Anthropic', plan, ownerName, renewalDay, payer: '본인', amount, currency: 'USD', billingCycle: 'monthly', status: 'active', note: null,
  })
  const roster = (lines: string[]) => parseRosterCsv([HEADER, ...lines].join('\n')).rows

  it('counts only rows whose values changed and reports no amounts', () => {
    const existing = [existingRow('a', '홍길동', 'Max20x', 6), existingRow('b', '김철수', 'Max5x', 14, '100.00')]
    const rows = roster(['홍길동,,anthropic,Max20x,200,6,본인,', '김철수,,anthropic,Max5x,100,14,현진우,'])
    const summary = summarizeRosterSync(planRosterSync(rows, existing), existing)

    expect(summary.counts).toEqual({ update: 1, insert: 0, remove: 0 })
    expect(summary.updated).toEqual([{ vendor: 'Anthropic', plan: 'Max5x', ownerName: '김철수', renewalDay: 14 }])
    expect(summary.unchanged).toBe(false)
    const { planHash: _planHash, ...shown } = summary
    expect(JSON.stringify(shown)).not.toMatch(/amount|200|100\.00/)
  })

  it('treats a plan change as one removal and one insertion', () => {
    const existing = [existingRow('a', '홍길동', 'Max5x', 14, '100.00')]
    const summary = summarizeRosterSync(planRosterSync(roster(['홍길동,,anthropic,Max20x,200,3,본인,']), existing), existing)

    expect(summary.counts).toEqual({ update: 0, insert: 1, remove: 1 })
    expect(summary.removed).toEqual([{ vendor: 'Anthropic', plan: 'Max5x', ownerName: '홍길동', renewalDay: 14 }])
    expect(summary.inserted).toEqual([{ vendor: 'Anthropic', plan: 'Max20x', ownerName: '홍길동', renewalDay: 3 }])
  })

  it('gives the same hash for the same plan and a different hash when the DB or roster moves', () => {
    const existing = [existingRow('a', '홍길동', 'Max20x', 6)]
    const rows = roster(['홍길동,,anthropic,Max20x,200,6,본인,'])
    const first = summarizeRosterSync(planRosterSync(rows, existing), existing)

    expect(first.unchanged).toBe(true)
    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/)
    expect(summarizeRosterSync(planRosterSync(rows, existing), existing).planHash).toBe(first.planHash)

    const grown = [...existing, existingRow('b', '김철수', 'Pro', 1, '20.00')]
    expect(summarizeRosterSync(planRosterSync(rows, grown), grown).planHash).not.toBe(first.planHash)
    const repriced = roster(['홍길동,,anthropic,Max20x,220,6,본인,'])
    expect(summarizeRosterSync(planRosterSync(repriced, existing), existing).planHash).not.toBe(first.planHash)
  })

  it('changes the hash when an existing DB value moves after plan, and ignores note and empty payer', () => {
    const existing = [existingRow('a', '홍길동', 'Max20x', 6)]
    const rows = roster(['홍길동,,anthropic,Max20x,200,6,본인,'])
    const first = summarizeRosterSync(planRosterSync(rows, existing), existing)
    const moved = [{ ...existing[0], amount: '999.00' }]
    expect(summarizeRosterSync(planRosterSync(rows, moved), moved).planHash).not.toBe(first.planHash)

    const noted = [{ ...existing[0], note: '손으로 적은 메모' }]
    expect(summarizeRosterSync(planRosterSync(rows, noted), noted).unchanged).toBe(true)
    const emptyPayer = [{ ...existing[0], payer: '' }]
    const noPayer = parseRosterCsv([HEADER, '홍길동,,anthropic,Max20x,200,6,,'].join('\n')).rows
    expect(summarizeRosterSync(planRosterSync(noPayer, emptyPayer), emptyPayer).unchanged).toBe(true)
  })
})
