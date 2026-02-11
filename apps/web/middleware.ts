/**
 * Authentication and organization context middleware
 *
 * Protects all routes with NextAuth session validation.
 * Validates and manages organization context via cookies.
 * Allows public access to auth, OAuth, MCP, and metadata endpoints.
 * Supports development bypass via DEV_BYPASS_AUTH environment variable.
 */
import { auth } from './lib/core/auth-config'
import type { NextAuthRequest } from 'next-auth'
import { NextResponse } from 'next/server'
const ORG_COOKIE_NAME = 'x-current-org-id'

function getCurrentOrgId(
  cookies: { get: (name: string) => { value: string } | undefined }
): string | undefined {
  return cookies.get(ORG_COOKIE_NAME)?.value
}

function setCurrentOrgCookie(orgId: string): string {
  const parts = [
    `${ORG_COOKIE_NAME}=${orgId}`,
    'Path=/',
    `Max-Age=${60 * 60 * 24 * 30}`,
    'SameSite=lax',
    'HttpOnly',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

function clearCurrentOrgCookie(): string {
  return `${ORG_COOKIE_NAME}=; Path=/; Max-Age=0`
}

const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'

export default auth(async (req: NextAuthRequest) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

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

  if (DEV_BYPASS_AUTH) {
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  const currentOrgId = getCurrentOrgId(req.cookies)
  const session = req.auth!
  const userId = session.user?.id
  const userRole = session.user?.role
  const orgIds = session.user?.orgIds || []

  if (currentOrgId && userId) {
    const hasAccess = orgIds.includes(currentOrgId)
    
    if (!hasAccess) {
      const response = NextResponse.redirect(new URL('/', req.url))
      response.headers.set('Set-Cookie', clearCurrentOrgCookie())
      return response
    }
  } else if (userId && orgIds.length > 0) {
    const firstOrgId = orgIds[0]
    const response = NextResponse.next()
    response.headers.set('Set-Cookie', setCurrentOrgCookie(firstOrgId))
    return response
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
