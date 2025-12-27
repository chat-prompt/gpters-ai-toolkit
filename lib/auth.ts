import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createLogger } from '@/lib/logger'
import type { UserRole } from '@/lib/rbac'

const log = createLogger('auth')

// Default role for new users
const DEFAULT_ROLE: UserRole = 'viewer'

// Allowed email domain for authentication
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
      // Only allow users with gpters.org email domain
      const email = user.email
      if (!email) return false

      const domain = email.split('@')[1]
      if (domain !== ALLOWED_DOMAIN) {
        return false
      }

      // Save or update user in database
      try {
        const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1)

        if (existingUser.length > 0) {
          // Update existing user
          await db.update(users)
            .set({
              name: user.name,
              image: user.image,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.email, email))
          // Store role in user object for session callback
          user.role = existingUser[0].role as UserRole
        } else {
          // Create new user with default role
          await db.insert(users).values({
            id: user.id || account?.providerAccountId || crypto.randomUUID(),
            email,
            name: user.name,
            image: user.image,
            role: DEFAULT_ROLE,
            lastLoginAt: new Date(),
          })
          // Store role in user object for session callback
          user.role = DEFAULT_ROLE
        }
      } catch (error) {
        log.error('Failed to save user', error, { action: 'signIn', userId: user.id })
        // Don't block sign in if DB save fails
      }

      return true
    },
    async session({ session, token }) {
      // Add user id and role to session
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})
