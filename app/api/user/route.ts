import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getItemsByAuthorId } from '@/lib/core/catalog'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

const log = createLogger('api:user')

// Development bypass check
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'

export async function GET(request: NextRequest) {
  // Rate limit: 100 requests per minute for profile queries
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()

    // In development with bypass enabled, return mock user data
    if (!session?.user?.email) {
      if (DEV_BYPASS_AUTH) {
        return NextResponse.json({
          user: {
            id: 'dev-user-id',
            email: 'dev@gpters.org',
            name: 'Development User',
            image: null,
            lastLoginAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          items: [],
          stats: {
            totalItems: 0,
            published: 0,
            drafts: 0,
            totalLikes: 0,
          },
        })
      }
      return ApiErrors.unauthorized()
    }

    // Get user from database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, session.user.email))

    if (!user) {
      return ApiErrors.notFound('User')
    }

    // Get items created by this user using authorId
    const allItems = await getItemsByAuthorId(user.id)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        createdAt: user.createdAt?.toISOString(),
      },
      items: allItems,
      stats: {
        totalItems: allItems.length,
        published: allItems.filter(i => i.status === 'published').length,
        drafts: allItems.filter(i => i.status === 'draft').length,
        totalLikes: allItems.reduce((sum, i) => sum + i.likes, 0),
      },
    })
  } catch (error) {
    log.error('Failed to fetch user profile', error)
    return ApiErrors.internalError('Failed to fetch user profile')
  }
}
