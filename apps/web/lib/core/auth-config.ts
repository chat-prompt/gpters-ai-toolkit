import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db, users, organizations, orgMemberships } from '@gpters/db'
import { eq, sql, and } from 'drizzle-orm'
import { createLogger } from '@gpters/lib/core'
import type { UserRole, OrgRole } from '@gpters/lib/security'

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
          // Fallback: enroll external users into the public organization
          const [publicOrg] = await db
            .select()
            .from(organizations)
            .where(
              and(
                eq(organizations.slug, 'public'),
                eq(organizations.isActive, true)
              )
            )

          if (!publicOrg) {
            log.warn('Login denied: no matching orgs and no public org', { email, domain })
            return false
          }

          matchingOrgs.push(publicOrg)
          log.info('External user matched to public org', { email, domain, orgId: publicOrg.id })
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
      // On sign-in: populate token from user object (already set by signIn callback)
      if (user) {
        token.id = user.id
        token.role = (user.role as UserRole) || DEFAULT_ROLE
        token.orgIds = user.orgIds || []
        token.tokenRefreshedAt = Date.now()

        // Set initial org context
        if (user.orgIds && user.orgIds.length > 0) {
          token.currentOrgId = user.orgIds[0]
          token.orgRole = DEFAULT_ORG_ROLE
        }

        return token
      }

      // On subsequent requests: refresh from DB every 5 minutes
      const REFRESH_INTERVAL = 5 * 60 * 1000
      const lastRefreshed = (token.tokenRefreshedAt as number) || 0
      if (Date.now() - lastRefreshed < REFRESH_INTERVAL) {
        return token
      }

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
          }
        }
        token.tokenRefreshedAt = Date.now()
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
