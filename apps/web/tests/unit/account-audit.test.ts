/**
 * 계정 점검 판정 테스트.
 *
 * 지켜야 할 것: 로그인 기록 없음과 오래됨을 구분할 것, 정지 계정은 휴면 목록에 넣지 않을 것,
 * 반쪽 정지(소속·토큰이 남은 정지)를 놓치지 않을 것, 이름 중복은 활성 계정끼리만 볼 것.
 */

import { describe, expect, it } from 'vitest'
import {
  buildAccountAuditReport,
  type AccountAuditInput,
} from '../../../../packages/lib/src/ops/account-audit'

const NOW = new Date('2026-09-08T00:00:00Z')

function account(overrides: Partial<AccountAuditInput> = {}): AccountAuditInput {
  return {
    userId: overrides.email ?? 'u',
    name: '홍길동',
    email: 'user@gpters.org',
    role: 'viewer',
    accountStatus: 'active',
    lastLoginAt: new Date('2026-09-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    activeMemberships: 1,
    liveAccessTokens: 0,
    liveRefreshTokens: 0,
    activeCollectors: 0,
    ownedItems: 0,
    lastEventAt: null,
    ...overrides,
  }
}

describe('buildAccountAuditReport', () => {
  it('아무 문제가 없으면 세 목록이 모두 비어 있다', () => {
    const report = buildAccountAuditReport([account()], { now: NOW })
    expect(report.dormant).toEqual([])
    expect(report.inconsistentSuspended).toEqual([])
    expect(report.duplicateNames).toEqual([])
    expect(report.checked).toBe(1)
  })

  it('기준일보다 오래된 로그인은 휴면이고, 오래된 순으로 세운다', () => {
    const report = buildAccountAuditReport(
      [
        account({ email: 'recent@gpters.org', lastLoginAt: new Date('2026-08-01T00:00:00Z') }),
        account({ email: 'old@gpters.org', lastLoginAt: new Date('2026-01-15T00:00:00Z'), ownedItems: 9 }),
        account({ email: 'older@gpters.org', lastLoginAt: new Date('2025-12-24T00:00:00Z') }),
      ],
      { now: NOW, dormantDays: 90 }
    )
    expect(report.dormant.map((row) => row.email)).toEqual(['older@gpters.org', 'old@gpters.org'])
    expect(report.dormant[1].ownedItems).toBe(9)
    expect(report.dormant[1].daysSinceActivity).toBe(236)
  })

  it('로그인 기록이 없는 계정은 "기록 없음"으로 맨 앞에 두고 일수를 만들지 않는다', () => {
    const report = buildAccountAuditReport(
      [account({ email: 'never@gpters.org', lastLoginAt: null })],
      { now: NOW }
    )
    expect(report.dormant).toHaveLength(1)
    expect(report.dormant[0].lastActivityAt).toBeNull()
    expect(report.dormant[0].daysSinceActivity).toBeNull()
  })

  it('웹 로그인은 오래됐어도 최근 스킬 이벤트가 있으면 휴면이 아니다 — CLI로만 쓰는 사람', () => {
    // 첫 운영 실행에서 실제로 잡혔던 오탐: 로그인 6/1, 스킬 이벤트 당일
    const report = buildAccountAuditReport(
      [account({ email: 'cli@gpters.org', lastLoginAt: new Date('2026-06-01T00:00:00Z'), lastEventAt: new Date('2026-09-08T00:00:00Z') })],
      { now: NOW, dormantDays: 90 }
    )
    expect(report.dormant).toEqual([])
  })

  it('스킬 이벤트가 로그인보다 오래됐으면 로그인을 마지막 활동으로 본다', () => {
    const report = buildAccountAuditReport(
      [account({ email: 'x@gpters.org', lastLoginAt: new Date('2026-01-01T00:00:00Z'), lastEventAt: new Date('2025-12-01T00:00:00Z') })],
      { now: NOW, dormantDays: 90 }
    )
    expect(report.dormant[0].lastActivityAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('정지된 계정은 휴면 목록에 넣지 않는다 — 이미 처리된 사람이다', () => {
    const report = buildAccountAuditReport(
      [account({ accountStatus: 'suspended', lastLoginAt: new Date('2026-01-01T00:00:00Z'), activeMemberships: 0 })],
      { now: NOW }
    )
    expect(report.dormant).toEqual([])
    expect(report.inconsistentSuspended).toEqual([])
  })

  it('정지인데 소속이나 토큰이 남아 있으면 반쪽 정지로 잡는다', () => {
    const report = buildAccountAuditReport(
      [
        account({ email: 'member@gpters.org', accountStatus: 'suspended', activeMemberships: 1 }),
        account({ email: 'token@gpters.org', accountStatus: 'suspended', activeMemberships: 0, liveAccessTokens: 1 }),
        account({ email: 'refresh@gpters.org', accountStatus: 'suspended', activeMemberships: 0, liveRefreshTokens: 2 }),
        account({ email: 'clean@gpters.org', accountStatus: 'suspended', activeMemberships: 0 }),
      ],
      { now: NOW }
    )
    expect(report.inconsistentSuspended.map((row) => row.email)).toEqual([
      'member@gpters.org',
      'token@gpters.org',
      'refresh@gpters.org',
    ])
  })

  it('같은 이름의 활성 계정이 둘이면 이름 중복으로 잡고, 정지 계정은 세지 않는다', () => {
    const report = buildAccountAuditReport(
      [
        account({ email: 'old@gpters.org', name: '홍지연', createdAt: new Date('2026-01-01T00:00:00Z') }),
        account({ email: 'new@gpters.org', name: '홍지연', createdAt: new Date('2026-09-04T00:00:00Z') }),
        account({ email: 'gone@gpters.org', name: '홍지연', accountStatus: 'suspended', activeMemberships: 0 }),
        account({ email: 'solo@gpters.org', name: '박수오' }),
      ],
      { now: NOW }
    )
    expect(report.duplicateNames).toHaveLength(1)
    expect(report.duplicateNames[0].name).toBe('홍지연')
    expect(report.duplicateNames[0].accounts.map((row) => row.email)).toEqual(['old@gpters.org', 'new@gpters.org'])
  })

  it('이름이 비어 있는 계정은 중복 판정에서 뺀다', () => {
    const report = buildAccountAuditReport(
      [account({ email: 'a@gpters.org', name: null }), account({ email: 'b@gpters.org', name: '' })],
      { now: NOW }
    )
    expect(report.duplicateNames).toEqual([])
  })
})
