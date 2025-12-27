import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createLogger } from '@/lib/logger'

const log = createLogger('auth')

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
        } else {
          // Create new user
          await db.insert(users).values({
            id: user.id || account?.providerAccountId || crypto.randomUUID(),
            email,
            name: user.name,
            image: user.image,
            lastLoginAt: new Date(),
          })
        }
      } catch (error) {
        log.error('Failed to save user', error, { action: 'signIn', userId: user.id })
        // Don't block sign in if DB save fails
      }

      return true
    },
    async session({ session, token }) {
      // Add user id to session
      if (token.sub && session.user) {
        session.user.id = token.sub
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})
