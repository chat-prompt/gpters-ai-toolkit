/**
 * AX Dashboard — 접근 권한
 *
 * 두 단계로만 나눈다.
 * 1. 대시보드 접근: 로그인한 내부 조직 구성원 전원 (이슈 요구사항 — 누구나 열람·개선)
 * 2. 개인 식별 데이터: 관리자 전용 (팀원별 구독처럼 사람이 특정되는 표)
 */

import { hasRoleOrHigher, type UserRole } from '../../security/rbac'

/** 접근 판정 입력 */
export interface AxViewerInput {
  email?: string | null
  role?: UserRole | null
}

/** 접근 판정 결과 */
export interface AxViewer {
  /** 대시보드 자체를 열 수 있는가 */
  canAccess: boolean
  /** 개인 식별 데이터를 볼 수 있는가 */
  isAdmin: boolean
  /** canAccess가 false일 때의 사유 (로그·안내용) */
  reason?: 'unauthenticated' | 'not_internal_member' | 'domain_not_configured'
}

/** 내부 조직 이메일 도메인 */
function internalDomain(): string {
  return (process.env.INTERNAL_ORGANIZATION_DOMAIN || '').trim().toLowerCase()
}

/**
 * 이메일이 내부 조직 도메인에 속하는지 판정
 *
 * `INTERNAL_ORGANIZATION_DOMAIN`이 비어 있으면 **아무도 통과하지 못한다**.
 * 이 대시보드는 사내 비용·배포 현황을 담으므로, 환경변수 누락이 조용한 전체 공개로
 * 이어지면 안 된다 (같은 환경변수를 쓰는 getting-started 화면과 동일한 방향).
 */
export function isInternalEmail(email?: string | null): boolean {
  const domain = internalDomain()
  if (!domain || !email) return false
  return email.toLowerCase().endsWith(`@${domain}`)
}

/**
 * 뷰어 권한 판정
 *
 * 관리자 역할이라도 내부 도메인 계정이 아니면 접근할 수 없다.
 * `users.role`은 조직과 무관한 전역 컬럼이라, 역할만으로 도메인 검사를 건너뛰면
 * 다른 조직 운영자에게 사내 데이터가 열린다.
 *
 * 개발 모드에서 `DEV_BYPASS_AUTH=true`면 관리자 뷰어로 통과시킨다 —
 * 로컬에는 OAuth 자격증명이 없어 세션을 만들 수 없기 때문이다.
 * 미들웨어의 같은 이름 바이패스와 동일하게 `NODE_ENV=development`로 이중 게이트한다.
 */
export function resolveAxViewer(input: AxViewerInput | null | undefined): AxViewer {
  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    return { canAccess: true, isAdmin: true }
  }

  if (!input?.email) {
    return { canAccess: false, isAdmin: false, reason: 'unauthenticated' }
  }

  if (!internalDomain()) {
    return { canAccess: false, isAdmin: false, reason: 'domain_not_configured' }
  }

  if (!isInternalEmail(input.email)) {
    return { canAccess: false, isAdmin: false, reason: 'not_internal_member' }
  }

  return { canAccess: true, isAdmin: hasRoleOrHigher(input.role ?? null, 'admin') }
}

/** 뷰어가 해당 공개 범위의 패널을 볼 수 있는지 */
export function canViewPanel(viewer: AxViewer, visibility: 'org' | 'admin'): boolean {
  if (!viewer.canAccess) return false
  return visibility === 'org' || viewer.isAdmin
}
