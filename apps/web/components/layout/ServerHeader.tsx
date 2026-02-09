/**
 * Server-side header wrapper that fetches authentication state
 *
 * Fetches the user session server-side and passes it to the client Header.
 * Supports DEV_BYPASS_AUTH for local development without OAuth.
 */
import { auth } from '@/lib/core/auth'
import { Header } from './Header'
import type { UserRole } from '@/lib/security/rbac'

/** Enable development auth bypass */
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'

/** Mock user for development when auth bypass is enabled */
const DEV_USER = {
  name: 'Dev User',
  email: 'dev@gpters.org',
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

  return <Header user={user} />
}
