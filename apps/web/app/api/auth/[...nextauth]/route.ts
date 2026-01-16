/**
 * NextAuth.js API route handler
 *
 * Exports GET and POST handlers for authentication flows.
 * Configuration is defined in @/lib/core/auth.
 */
import { handlers } from '@/lib/core/auth'

export const { GET, POST } = handlers
