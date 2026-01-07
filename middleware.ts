/**
 * Authentication middleware
 *
 * Protects all routes with NextAuth session validation.
 * Allows public access to auth, OAuth, MCP, and metadata endpoints.
 * Supports development bypass via DEV_BYPASS_AUTH environment variable.
 */
import { auth } from '@/lib/core/auth'
import { NextResponse } from 'next/server'

// Development auth bypass
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Allow auth routes, MCP endpoints, OAuth endpoints, hooks, well-known paths, and metadata files to pass through
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/mcp') ||
    pathname.startsWith('/api/hooks') ||
    pathname.startsWith('/oauth') ||
    pathname.startsWith('/.well-known') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  // Skip auth in development if bypass is enabled
  if (DEV_BYPASS_AUTH) {
    return NextResponse.next()
  }

  // Redirect to signin if not logged in
  if (!isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder files (.png, .jpg, .svg, .mjs)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.mjs$).*)',
  ],
}
