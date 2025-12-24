import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

// Allowed email domain for authentication
const ALLOWED_DOMAIN = 'gpters.org'

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow users with gpters.org email domain
      const email = user.email
      if (!email) return false

      const domain = email.split('@')[1]
      if (domain !== ALLOWED_DOMAIN) {
        return false
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
