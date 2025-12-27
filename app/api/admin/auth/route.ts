import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ApiErrors } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:admin:auth')

const COOKIE_NAME = 'admin_session'
const COOKIE_MAX_AGE = 60 * 60 * 8 // 8 hours

/**
 * POST /api/admin/auth
 * Validate admin password and set httpOnly session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (password !== process.env.ADMIN_PASSWORD) {
      return ApiErrors.unauthorized('Invalid password')
    }

    // Create a simple session token (in production, use a proper JWT or session store)
    const sessionToken = Buffer.from(`admin:${Date.now()}`).toString('base64')

    const response = NextResponse.json({ success: true })

    // Set httpOnly cookie
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/admin',
    })

    return response
  } catch (error) {
    log.error('Auth failed', error)
    return ApiErrors.badRequest('Invalid request')
  }
}

/**
 * DELETE /api/admin/auth
 * Clear admin session cookie
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true })

  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/admin',
  })

  return response
}

/**
 * GET /api/admin/auth
 * Check if admin session is valid
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(COOKIE_NAME)

    if (!sessionCookie?.value) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    // Validate session token
    const decoded = Buffer.from(sessionCookie.value, 'base64').toString()
    if (decoded.startsWith('admin:')) {
      return NextResponse.json({ authenticated: true })
    }

    return NextResponse.json({ authenticated: false }, { status: 401 })
  } catch (error) {
    log.error('Auth check failed', error)
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
