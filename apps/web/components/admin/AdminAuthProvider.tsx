/**
 * Admin authentication provider and hook
 *
 * Provides authentication context for admin dashboard,
 * managing user session state and role-based access control.
 */
'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { UserRole } from '@/lib/security/rbac'

/**
 * Admin authentication context type
 */
interface AdminAuthContextType {
  /** Whether user is authenticated with admin role */
  isAuthenticated: boolean
  /** Whether session is being loaded */
  isLoading: boolean
  /** Current user's role */
  userRole: UserRole | null
  /** Logout function */
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

/** Roles that can access admin dashboard */
const ADMIN_ROLES: UserRole[] = ['admin', 'editor', 'viewer']

/**
 * Provider component for admin authentication context
 *
 * @example
 * ```tsx
 * <AdminAuthProvider>
 *   <AdminDashboard />
 * </AdminAuthProvider>
 * ```
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()

  const isLoading = status === 'loading'
  const userRole = (session?.user?.role as UserRole) || null
  const isAuthenticated = !!session?.user && !!userRole && ADMIN_ROLES.includes(userRole)

  const logout = async () => {
    await signOut({ callbackUrl: '/' })
  }

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, userRole, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

/**
 * Hook to access admin authentication context
 *
 * @returns Admin authentication state and methods
 * @throws Error if used outside AdminAuthProvider
 *
 * @example
 * ```tsx
 * const { isAuthenticated, userRole, logout } = useAdminAuth()
 * ```
 */
export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return context
}
