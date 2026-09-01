/**
 * NextAuth.js authentication configuration
 *
 * Configures Google OAuth with organization-based domain resolution,
 * user session management, and role-based access control.
 */
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db, users, organizations, orgMemberships } from '@gpters/db'
import { eq, sql, and } from 'drizzle-orm'
import { createLogger } from './logger'
import type { UserRole, OrgRole } from '../security/rbac'
import { accessDomainOf, isAllowedAccountEmail } from '../account-access'

const log = createLogger('auth')

const DEFAULT_ROLE: UserRole = 'viewer'
const DEFAULT_ORG_ROLE: OrgRole = 'org_viewer'

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: process.env.NODE_ENV === 'development',
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!isAllowedAccountEmail(user.email)) {
        log.warn('Login denied: account is not authorized')
        return false
      }

      const email = user.email.trim().toLowerCase()
      user.email = email
      const domain = accessDomainOf(email)

      try {
        const matchingOrgs = await db
          .select()
          .from(organizations)
          .where(
            and(
              sql`${organizations.allowedDomains}::jsonb @> ${JSON.stringify([domain])}::jsonb`,
              eq(organizations.isActive, true)
            )
          )

        if (matchingOrgs.length === 0) {
          log.warn('Login denied: no matching organizations', { email, domain })
          return false
        }

        const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1)

        let userId: string
        if (existingUser.length > 0) {
          if (existingUser[0].accountStatus === 'suspended') {
            log.warn('Login denied: account is suspended', { userId: existingUser[0].id })
            return false
          }
          userId = existingUser[0].id
          await db.update(users)
            .set({
              name: user.name,
              image: user.image,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.email, email))
          user.role = existingUser[0].role as UserRole
        } else {
          userId = user.id || account?.providerAccountId || crypto.randomUUID()
          await db.insert(users).values({
            id: userId,
            email,
            name: user.name,
            image: user.image,
            role: DEFAULT_ROLE,
            lastLoginAt: new Date(),
          })
          user.role = DEFAULT_ROLE
        }

        const orgIds: string[] = []
        for (const org of matchingOrgs) {
          const existingMembership = await db
            .select()
            .from(orgMemberships)
            .where(
              and(
                eq(orgMemberships.userId, userId),
                eq(orgMemberships.orgId, org.id)
              )
            )
            .limit(1)

          if (existingMembership.length === 0) {
            await db.insert(orgMemberships).values({
              userId,
              orgId: org.id,
              role: DEFAULT_ORG_ROLE,
              status: 'active',
            })
            orgIds.push(org.id)
            log.info('Created org membership', { userId, orgId: org.id, role: DEFAULT_ORG_ROLE })
          } else if (existingMembership[0].status === 'active') {
            orgIds.push(org.id)
          } else {
            log.warn('Skipped offboarded organization membership during login', {
              userId,
              orgId: org.id,
            })
          }
        }

        if (orgIds.length === 0) {
          log.warn('Login denied: no active organization memberships', { userId })
          return false
        }

        user.orgIds = orgIds

      } catch (error) {
        log.error('Failed during sign in', error, { action: 'signIn', userId: user.id })
        return false
      }

      return true
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) {
          session.user.id = token.sub
        }
        if (token.role) {
          session.user.role = token.role as UserRole
        }
        if (token.currentOrgId) {
          session.user.currentOrgId = token.currentOrgId
        }
        if (token.orgRole) {
          session.user.orgRole = token.orgRole as OrgRole
        }
        if (token.orgIds) {
          session.user.orgIds = token.orgIds
        }
      }
      return session
    },
    async jwt({ token, user }) {
      if (!isAllowedAccountEmail(token.email)) {
        return null
      }

      if (user) {
        token.id = user.id
      }

      try {
        const email = token.email.trim().toLowerCase()
        if (email) {
          const [dbUser] = await db
            .select({ 
              id: users.id,
              role: users.role,
              accountStatus: users.accountStatus,
            })
            .from(users)
            .where(eq(users.email, email))

          if (!dbUser || dbUser.accountStatus !== 'active') {
            return null
          }

          token.role = dbUser.role as UserRole

          const userOrgMemberships = await db
            .select({
              orgId: orgMemberships.orgId,
              role: orgMemberships.role,
            })
            .from(orgMemberships)
            .where(
              and(
                eq(orgMemberships.userId, dbUser.id),
                eq(orgMemberships.status, 'active')
              )
            )

          if (userOrgMemberships.length === 0) {
            return null
          }

          token.orgIds = userOrgMemberships.map(m => m.orgId)
          if (!token.currentOrgId || !token.orgIds.includes(token.currentOrgId as string)) {
            token.currentOrgId = userOrgMemberships[0].orgId
            token.orgRole = userOrgMemberships[0].role as OrgRole
          } else {
            const currentMembership = userOrgMemberships.find(m => m.orgId === token.currentOrgId)
            if (currentMembership) {
              token.orgRole = currentMembership.role as OrgRole
            }
          }
        }
      } catch {
        // Keep existing token values on DB error
      }

      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})
