import { DefaultSession, DefaultUser } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'
import type { UserRole, OrgRole } from '@/lib/security/rbac'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      currentOrgId?: string
      orgRole?: OrgRole
      orgIds?: string[]
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role?: UserRole
    orgIds?: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string
    role?: UserRole
    orgIds?: string[]
    currentOrgId?: string
    orgRole?: OrgRole
  }
}
