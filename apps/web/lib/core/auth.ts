/**
 * Auth re-exports for the web app
 *
 * Re-exports from auth-config.ts (org-aware version) instead of the package default.
 * The cachedAuth function deduplicates auth() calls within a single request
 * using React's cache(), eliminating redundant JWT decoding and DB queries
 * when multiple server components call auth() in the same render.
 */
import { cache } from 'react'
import { auth as _auth, handlers, signIn, signOut } from './auth-config'

/** Deduplicated auth — safe to call from multiple server components per request */
const auth = cache(_auth)

export { handlers, signIn, signOut, auth }
