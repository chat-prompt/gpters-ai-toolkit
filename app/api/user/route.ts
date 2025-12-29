import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getItemsByAuthor } from '@/lib/core/catalog'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

const log = createLogger('api:user')

export async function GET(request: NextRequest) {
  // Rate limit: 100 requests per minute for profile queries
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()

    if (!session?.user?.email) {
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

    // Get items created by this user (matching by email username)
    const authorName = session.user.email.split('@')[0]
    const items = await getItemsByAuthor(authorName)

    // Also try with full name if different
    const allItems = [...items]
    if (session.user.name && session.user.name !== authorName) {
      const nameItems = await getItemsByAuthor(session.user.name)
      // Merge and dedupe
      const itemIds = new Set(items.map(i => i.id))
      for (const item of nameItems) {
        if (!itemIds.has(item.id)) {
          allItems.push(item)
        }
      }
    }

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
