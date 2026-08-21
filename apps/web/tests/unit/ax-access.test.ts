/**
 * AX 대시보드 접근 권한 단위 테스트
 *
 * 대시보드 자체는 사내 구성원 전원에게 열려 있고,
 * 개인 식별 데이터가 담긴 패널만 관리자에게 제한된다 — 이 두 단계를 고정한다.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  resolveAxViewer,
  canViewPanel,
  isInternalEmail,
} from '../../../../packages/lib/src/features/ax/access'

const ORIGINAL_DOMAIN = process.env.INTERNAL_ORGANIZATION_DOMAIN

describe('resolveAxViewer', () => {
  beforeEach(() => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'
  })

  afterAll(() => {
    if (ORIGINAL_DOMAIN === undefined) {
      delete process.env.INTERNAL_ORGANIZATION_DOMAIN
    } else {
      process.env.INTERNAL_ORGANIZATION_DOMAIN = ORIGINAL_DOMAIN
    }
  })

  it('비로그인이면 접근을 막고 사유를 남긴다', () => {
    expect(resolveAxViewer(null)).toEqual({
      canAccess: false,
      isAdmin: false,
      reason: 'unauthenticated',
    })
    expect(resolveAxViewer({ email: null, role: 'viewer' })).toEqual({
      canAccess: false,
      isAdmin: false,
      reason: 'unauthenticated',
    })
  })

  it('내부 도메인 이메일이면 viewer 역할도 열람할 수 있다', () => {
    const viewer = resolveAxViewer({ email: 'member@gpters.org', role: 'viewer' })

    expect(viewer.canAccess).toBe(true)
    expect(viewer.isAdmin).toBe(false)
    expect(viewer.reason).toBeUndefined()
  })

  it('이메일 대소문자가 섞여도 내부 도메인으로 인정한다', () => {
    expect(resolveAxViewer({ email: 'Member@GPters.org', role: 'viewer' }).canAccess).toBe(true)
  })

  it('외부 도메인 이메일이면 막고 사유를 남긴다', () => {
    const viewer = resolveAxViewer({ email: 'outsider@example.com', role: 'viewer' })

    expect(viewer.canAccess).toBe(false)
    expect(viewer.isAdmin).toBe(false)
    expect(viewer.reason).toBe('not_internal_member')
  })

  it('내부 도메인 계정이면서 admin 이상일 때만 관리자 권한을 갖는다', () => {
    for (const role of ['admin', 'super_admin'] as const) {
      const viewer = resolveAxViewer({ email: 'ops@gpters.org', role })

      expect(viewer.canAccess).toBe(true)
      expect(viewer.isAdmin).toBe(true)
    }
  })

  it('역할이 admin이어도 외부 도메인 계정은 막는다', () => {
    // users.role은 조직과 무관한 전역 값이다.
    // 다른 조직 운영자에게 사내 데이터가 열리면 안 된다.
    for (const role of ['admin', 'super_admin'] as const) {
      const viewer = resolveAxViewer({ email: 'ops@example.com', role })

      expect(viewer.canAccess).toBe(false)
      expect(viewer.isAdmin).toBe(false)
      expect(viewer.reason).toBe('not_internal_member')
    }
  })

  it('editor는 관리자가 아니라 내부 도메인 조건을 그대로 받는다', () => {
    expect(resolveAxViewer({ email: 'editor@gpters.org', role: 'editor' })).toEqual({
      canAccess: true,
      isAdmin: false,
    })
    expect(resolveAxViewer({ email: 'editor@example.com', role: 'editor' }).canAccess).toBe(false)
  })

  it('도메인 설정이 비어 있으면 아무도 통과시키지 않는다', () => {
    // 환경변수 누락이 조용한 전체 공개로 이어지면 안 된다
    delete process.env.INTERNAL_ORGANIZATION_DOMAIN
    expect(resolveAxViewer({ email: 'anyone@gpters.org', role: 'admin' })).toEqual({
      canAccess: false,
      isAdmin: false,
      reason: 'domain_not_configured',
    })

    process.env.INTERNAL_ORGANIZATION_DOMAIN = '   '
    expect(resolveAxViewer({ email: 'anyone@gpters.org', role: 'viewer' }).canAccess).toBe(false)
  })

  it('도메인이 설정돼 있어도 로그인 자체가 없으면 통과시키지 않는다', () => {
    delete process.env.INTERNAL_ORGANIZATION_DOMAIN
    expect(resolveAxViewer({ email: null, role: 'viewer' }).reason).toBe('unauthenticated')
  })

  it('DEV_BYPASS_AUTH는 개발 모드가 아니면 무시된다', () => {
    // NODE_ENV가 test인 지금 환경에서 그대로 검증한다 — 프로덕션에서도 같은 이유로 무시된다
    process.env.DEV_BYPASS_AUTH = 'true'
    try {
      expect(resolveAxViewer(null).canAccess).toBe(false)
      expect(resolveAxViewer({ email: 'outsider@example.com', role: 'admin' }).canAccess).toBe(false)
    } finally {
      delete process.env.DEV_BYPASS_AUTH
    }
  })
})

describe('isInternalEmail', () => {
  beforeEach(() => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = 'gpters.org'
  })

  it('도메인이 정확히 일치할 때만 내부로 본다', () => {
    expect(isInternalEmail('a@gpters.org')).toBe(true)
    expect(isInternalEmail('a@notgpters.org')).toBe(false)
    expect(isInternalEmail('a@gpters.org.evil.com')).toBe(false)
    expect(isInternalEmail(null)).toBe(false)
  })
})

describe('canViewPanel', () => {
  it('일반 구성원은 org 패널만 볼 수 있다', () => {
    const member = { canAccess: true, isAdmin: false }

    expect(canViewPanel(member, 'org')).toBe(true)
    expect(canViewPanel(member, 'admin')).toBe(false)
  })

  it('관리자는 두 범위 모두 볼 수 있다', () => {
    const admin = { canAccess: true, isAdmin: true }

    expect(canViewPanel(admin, 'org')).toBe(true)
    expect(canViewPanel(admin, 'admin')).toBe(true)
  })

  it('접근 자체가 막힌 뷰어는 어떤 패널도 볼 수 없다', () => {
    const blocked = { canAccess: false, isAdmin: false, reason: 'not_internal_member' as const }

    expect(canViewPanel(blocked, 'org')).toBe(false)
    expect(canViewPanel(blocked, 'admin')).toBe(false)
  })
})

describe('환경변수 값이 지저분해도 판정이 흔들리지 않는다', () => {
  /**
   * 실제로 났던 사고를 고정한다.
   *
   * Vercel의 INTERNAL_ORGANIZATION_DOMAIN 값 끝에 개행이 붙어 있었고,
   * `email.endsWith('@' + domain)`을 직접 쓰던 화면에서는 사내 구성원도 항상 false였다.
   * 판정을 isInternalEmail 한 곳으로 모았으니, 그 함수가 다듬기를 계속 하는지 지킨다.
   */
  it.each([
    ['개행', 'gpters.org\n'],
    ['앞뒤 공백', '  gpters.org  '],
    ['대문자', 'GPTERS.ORG'],
  ])('%s가 섞여 있어도 내부 구성원을 통과시킨다', (_label, value) => {
    process.env.INTERNAL_ORGANIZATION_DOMAIN = value
    expect(isInternalEmail('primadonna@gpters.org')).toBe(true)
    expect(isInternalEmail('outsider@example.com')).toBe(false)
  })
})
