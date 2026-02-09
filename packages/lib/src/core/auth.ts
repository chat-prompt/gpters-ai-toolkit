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
      const email = user.email
      if (!email) return false

      const domain = email.split('@')[1]
      if (!domain) return false

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
          userId = existingUser[0].id
          await db.update(users)
            .set({
              name: user.name,
              image: user.image,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.email, email))
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
        }

        const orgIds: string[] = []
        for (const org of matchingOrgs) {
          orgIds.push(org.id)

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
            })
            log.info('Created org membership', { userId, orgId: org.id, role: DEFAULT_ORG_ROLE })
          }
        }

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
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
      }

      if (trigger === 'update' || !token.role || !token.orgIds) {
        try {
          const email = token.email as string
          if (email) {
            const [dbUser] = await db
              .select({ 
                id: users.id,
                role: users.role 
              })
              .from(users)
              .where(eq(users.email, email))

            if (dbUser) {
              token.role = dbUser.role as UserRole

              const userOrgMemberships = await db
                .select({
                  orgId: orgMemberships.orgId,
                  role: orgMemberships.role,
                })
                .from(orgMemberships)
                .where(eq(orgMemberships.userId, dbUser.id))

              if (userOrgMemberships.length > 0) {
                token.orgIds = userOrgMemberships.map(m => m.orgId)
                token.currentOrgId = userOrgMemberships[0].orgId
                token.orgRole = userOrgMemberships[0].role as OrgRole
              }
            }
          }
        } catch {
          // Keep existing values on error
        }
      }

      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})
