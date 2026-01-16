import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db, users } from '@gpters/db'
import { eq } from 'drizzle-orm'
import { createLogger } from '@gpters/lib/core'
import type { UserRole } from '@gpters/lib/security'

const log = createLogger('auth')

const DEFAULT_ROLE: UserRole = 'viewer'
const ALLOWED_DOMAIN = 'gpters.org'

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
      if (domain !== ALLOWED_DOMAIN) {
        return false
      }

      try {
        const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1)

        if (existingUser.length > 0) {
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
          await db.insert(users).values({
            id: user.id || account?.providerAccountId || crypto.randomUUID(),
            email,
            name: user.name,
            image: user.image,
            role: DEFAULT_ROLE,
            lastLoginAt: new Date(),
          })
          user.role = DEFAULT_ROLE
        }
      } catch (error) {
        log.error('Failed to save user', error, { action: 'signIn', userId: user.id })
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
      }
      return session
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }

      if (trigger === 'update' || !token.role) {
        try {
          const email = token.email as string
          if (email) {
            const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.email, email))
            if (dbUser) {
              token.role = dbUser.role as UserRole
            }
          }
        } catch {
          // Keep existing role on error
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
