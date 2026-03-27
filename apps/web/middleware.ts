/**
 * Combined i18n and authentication middleware
 *
 * Chains next-intl locale routing with NextAuth session validation.
 * Validates and manages organization context via cookies.
 * Allows public access to auth, OAuth, MCP, and metadata endpoints.
 * Supports development bypass via DEV_BYPASS_AUTH environment variable.
 */
import createMiddleware from 'next-intl/middleware'
import { auth } from './lib/core/auth-config'
import type { NextAuthRequest } from 'next-auth'
import { NextResponse } from 'next/server'
import { routing } from './i18n/routing'

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

/** next-intl middleware for locale routing */
const intlMiddleware = createMiddleware(routing)

/**
 * Check if a pathname is a public route (no auth required)
 * Handles both prefixed (/en/welcome) and non-prefixed (/welcome) paths
 */
function isPublicRoute(pathname: string): boolean {
  // Strip locale prefix for route matching
  const strippedPath = pathname.replace(/^\/(en|ko)/, '') || '/'

  return (
    strippedPath.startsWith('/auth') ||
    strippedPath.startsWith('/api/auth') ||
    strippedPath.startsWith('/api/mcp') ||
    strippedPath.startsWith('/api/cli-token') ||
    strippedPath.startsWith('/api/device') ||
    strippedPath.startsWith('/api/hooks') ||
    strippedPath.startsWith('/privacy') ||
    strippedPath.startsWith('/welcome') ||
    strippedPath.startsWith('/api/skills') ||
    strippedPath.startsWith('/api/models') ||
    strippedPath.startsWith('/api/sdk-docs') ||
    strippedPath.startsWith('/api/tool-docs') ||
    strippedPath.startsWith('/api/cron') ||
    strippedPath.startsWith('/oauth') ||
    strippedPath.startsWith('/.well-known') ||
    strippedPath === '/robots.txt' ||
    strippedPath === '/sitemap.xml'
  )
}

/**
 * Check if a pathname is an API route (skip locale processing)
 */
function isApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/oauth') ||
    pathname.startsWith('/.well-known') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  )
}

export default auth(async (req: NextAuthRequest) => {
  const { pathname } = req.nextUrl

  // Skip locale middleware for API routes and static files
  if (isApiRoute(pathname)) {
    // Still handle public route bypass
    if (isPublicRoute(pathname)) {
      return NextResponse.next()
    }

    if (DEV_BYPASS_AUTH) {
      return NextResponse.next()
    }

    if (!req.auth) {
      const signInUrl = new URL('/auth/signin', req.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signInUrl)
    }

    return NextResponse.next()
  }

  // Public routes: apply locale middleware only (no auth check)
  if (isPublicRoute(pathname)) {
    return intlMiddleware(req)
  }

  if (DEV_BYPASS_AUTH) {
    return intlMiddleware(req)
  }

  const isLoggedIn = !!req.auth
  if (!isLoggedIn) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Organization context handling
  const currentOrgId = getCurrentOrgId(req.cookies)
  const session = req.auth!
  const userId = session.user?.id
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
    const intlResponse = intlMiddleware(req)
    intlResponse.headers.set('Set-Cookie', setCurrentOrgCookie(firstOrgId))
    return intlResponse
  }

  return intlMiddleware(req)
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
