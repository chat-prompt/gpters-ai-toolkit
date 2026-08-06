/**
 * Server-side header wrapper that fetches authentication state
 *
 * Fetches the user session server-side and passes it to the client Header.
 * Supports DEV_BYPASS_AUTH for local development without OAuth.
 */
import { auth } from '@/lib/core/auth'
import { Header } from './Header'
import { resolveAxViewer } from '@/lib/features/ax'
import type { UserRole } from '@/lib/security/rbac'

/** Enable development auth bypass */
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'

/** Mock user for development when auth bypass is enabled */
const DEV_USER = {
  name: 'Dev User',
  email: process.env.DEV_USER_EMAIL || 'dev@example.com',
  image: null,
  role: 'admin' as UserRole,
  orgIds: ['dev-org-1', 'dev-org-2'],
  currentOrgId: 'dev-org-1',
}

/**
 * Server component that fetches auth session and renders Header
 *
 * Uses Next.js auth() to get the current session server-side,
 * eliminating the need for client-side session fetching.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <ServerHeader />
 * ```
 */
export async function ServerHeader() {
  const session = await auth()
  const user = DEV_BYPASS_AUTH ? DEV_USER : session?.user

  // AX 대시보드 접근 판정은 서버에서만 가능하다 (내부 도메인 값이 서버 전용).
  // 여기서 걸러 두지 않으면 권한 없는 사용자가 탭을 눌렀다가 홈으로 되돌려진다.
  const canViewAx = resolveAxViewer({
    email: user?.email,
    role: user?.role as UserRole | undefined,
  }).canAccess

  return <Header user={user} canViewAx={canViewAx} />
}
