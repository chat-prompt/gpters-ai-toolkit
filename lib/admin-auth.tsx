'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

interface AdminAuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  password: string | null
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [password, setPassword] = useState<string | null>(null)

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/auth')
        if (res.ok) {
          setIsAuthenticated(true)
          // Retrieve password from sessionStorage only for API calls during session
          const storedPassword = sessionStorage.getItem('_admin_api_key')
          if (storedPassword) {
            setPassword(storedPassword)
          }
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [])

  const login = useCallback(async (inputPassword: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: inputPassword }),
      })

      if (res.ok) {
        setIsAuthenticated(true)
        setPassword(inputPassword)
        // Store password in sessionStorage for API calls (cleared on tab close)
        // This is still in sessionStorage but the auth cookie is httpOnly
        sessionStorage.setItem('_admin_api_key', inputPassword)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' })
    } catch {
      // Ignore errors
    }
    setIsAuthenticated(false)
    setPassword(null)
    sessionStorage.removeItem('_admin_api_key')
  }, [])

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, password, login, logout }}>
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
