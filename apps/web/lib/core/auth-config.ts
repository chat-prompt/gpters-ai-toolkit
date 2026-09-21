import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db, users, organizations, orgMemberships } from '@gpters/db'
import { eq, sql, and } from 'drizzle-orm'
import { createLogger } from '@gpters/lib/core'
import { GPTTERS_EMAIL_DOMAIN, isAllowedAccountEmail } from '@gpters/lib/account-access'
import type { UserRole, OrgRole } from '@gpters/lib/security'

const log = createLogger('auth')

const DEFAULT_ROLE: UserRole = 'viewer'
const DEFAULT_ORG_ROLE: OrgRole = 'org_viewer'
/** DB 조회 실패 시 직전 토큰을 믿어 주는 최대 시간 */
const STALE_AUTH_GRACE_MS = 10 * 60 * 1000

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
      const email = user.email?.trim().toLowerCase()
      if (!email || !(await isAllowedAccountEmail(email))) {
        log.warn('Login denied: account is not authorized')
        return false
      }

      user.email = email
      const domain = GPTTERS_EMAIL_DOMAIN

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

        // 세션의 user.id 는 token.sub 에서 온다. Auth.js 는 어댑터 없이 로그인마다 임의 id 를
        // 만들기 때문에, 여기서 users.id 로 고정하지 않으면 세션 id 와 계정 id 가 갈린다.
        user.id = userId

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

        // Rona 유저 매핑 (이메일 기반, fire-and-forget)
        const ronaUrl = process.env.RONA_API_URL
        const ronaToken = process.env.RONA_SERVICE_TOKEN
        if (ronaUrl && ronaToken && !existingUser[0]?.ronaUserId) {
          try {
            const ronaRes = await fetch(`${ronaUrl}/api/v1/users/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ronaToken}`,
              },
              body: JSON.stringify({ email }),
            })
            if (ronaRes.ok) {
              const ronaData = await ronaRes.json()
              if (ronaData.verified && ronaData.user?.id) {
                await db.update(users)
                  .set({ ronaUserId: ronaData.user.id, updatedAt: new Date() })
                  .where(eq(users.id, userId))
                log.info('Rona user mapped', { userId, ronaUserId: ronaData.user.id })
              }
            }
          } catch (ronaErr) {
            log.warn('Rona user mapping failed (non-critical)', { userId, error: ronaErr })
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
    async jwt({ token, user }) {
      if (!(await isAllowedAccountEmail(token.email))) {
        return null
      }

      // On sign-in: populate token from user object (already set by signIn callback)
      if (user) {
        token.id = user.id
        token.sub = user.id
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

      try {
        const email = token.email?.trim().toLowerCase()
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

          // 이 수정 전에 발급된 세션도 다음 요청부터 계정 id 로 맞춘다 (재로그인 불필요)
          token.sub = dbUser.id
          token.id = dbUser.id
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
        token.tokenRefreshedAt = Date.now()
      } catch {
        // 짧은 DB 장애에는 직전 토큰을 유지하되, 마지막 정상 확인이 오래됐으면 세션을 끊는다.
        // 유지하는 동안에는 계정 정지·멤버십 해제를 확인하지 못하므로 그 창을 제한해야
        // 정지된 계정이 장애 중에 권한을 계속 쓰지 못한다 (DEV-4319 교차 리뷰).
        const refreshedAt = typeof token.tokenRefreshedAt === 'number' ? token.tokenRefreshedAt : 0
        const age = Date.now() - refreshedAt
        // 미래 시각은 서명된 토큰이라도 믿지 않는다 — 시계 차이만큼 유예가 늘어나면 안 된다
        if (age < 0 || age > STALE_AUTH_GRACE_MS) {
          log.warn('계정 확인 실패가 유예를 넘겨 세션을 끊는다', { email: token.email, age })
          return null
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
