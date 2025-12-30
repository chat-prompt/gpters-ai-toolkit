'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { UserRole } from '@/lib/security/rbac'

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  userRole: UserRole | null
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

// Roles that can access admin dashboard
const ADMIN_ROLES: UserRole[] = ['admin', 'editor', 'viewer']

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

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return context
}
