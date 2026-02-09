'use client'

/**
 * Client-side React hook for managing organization context
 *
 * Provides organization switching functionality and current org state from session.
 * Uses cookies for persistence and triggers page refresh on org switch.
 */

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import type { OrgRole } from '@gpters/lib/security'

const ORG_COOKIE_NAME = 'x-current-org-id'

/**
 * Organization context hook return type
 */
export interface OrgContext {
  currentOrgId?: string
  orgIds?: string[]
  orgRole?: OrgRole
  switchOrg: (orgId: string) => Promise<void>
  isLoading: boolean
}

/**
 * Hook for managing organization context on the client
 *
 * @returns Organization context with current org, available orgs, and switch function
 */
export function useOrgContext(): OrgContext {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const getCurrentOrgIdFromCookie = useCallback((): string | undefined => {
    if (typeof document === 'undefined') return undefined
    const cookies = document.cookie.split('; ')
    const orgCookie = cookies.find(c => c.startsWith(`${ORG_COOKIE_NAME}=`))
    return orgCookie?.split('=')[1]
  }, [])

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (!session?.user?.orgIds?.includes(orgId)) {
        console.error('Cannot switch to org: user is not a member')
        return
      }

      setIsLoading(true)
      try {
        document.cookie = `${ORG_COOKIE_NAME}=${orgId}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${
          process.env.NODE_ENV === 'production' ? '; secure' : ''
        }`

        router.refresh()
      } catch (error) {
        console.error('Failed to switch organization:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [session?.user?.orgIds, router]
  )

  const currentOrgId = getCurrentOrgIdFromCookie() || session?.user?.currentOrgId
  const orgIds = session?.user?.orgIds
  const orgRole = session?.user?.orgRole as OrgRole | undefined

  return {
    currentOrgId,
    orgIds,
    orgRole,
    switchOrg,
    isLoading: isLoading || status === 'loading',
  }
}
