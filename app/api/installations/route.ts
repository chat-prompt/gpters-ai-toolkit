import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db, installations, catalogItems } from '@/lib/db'
import { eq, desc, sql, and, gte } from 'drizzle-orm'
import { ApiErrors, validateRequired, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:installations')

type InstallMethod = 'cli' | 'mcp' | 'plugin' | 'manual_content' | 'manual_folder' | 'manual_file'

const VALID_METHODS: InstallMethod[] = ['cli', 'mcp', 'plugin', 'manual_content', 'manual_folder', 'manual_file']

// POST - Track an installation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequired(body, ['itemId', 'method'])
    if (!validation.valid) {
      return ApiErrors.badRequest(`Missing required fields: ${validation.missing.join(', ')}`)
    }

    const { itemId, method } = body

    // Validate method
    if (!VALID_METHODS.includes(method)) {
      return ApiErrors.badRequest(`Invalid method. Must be one of: ${VALID_METHODS.join(', ')}`)
    }

    // Verify item exists
    const [item] = await db.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.id, itemId))
    if (!item) {
      return ApiErrors.notFound('Item')
    }

    // Get user ID if authenticated
    let userId: string | null = null
    try {
      const session = await auth()
      if (session?.user?.id) {
        userId = session.user.id
      }
    } catch {
      // Ignore auth errors, just track as anonymous
    }

    // Record installation
    await db.insert(installations).values({
      itemId,
      method,
      userId,
    })

    return apiSuccess({ success: true })
  } catch (error) {
    log.error('Failed to track installation', error)
    return ApiErrors.internalError('Failed to track installation')
  }
}

// GET - Get installation statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('itemId')
    const period = searchParams.get('period') || '30d' // 7d, 30d, 90d, all

    // Calculate date range
    let startDate: Date | null = null
    if (period !== 'all') {
      const days = parseInt(period.replace('d', ''), 10) || 30
      startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
    }

    if (itemId) {
      // Get stats for specific item
      const conditions = startDate
        ? and(eq(installations.itemId, itemId), gte(installations.createdAt, startDate))
        : eq(installations.itemId, itemId)

      const stats = await db
        .select({
          method: installations.method,
          count: sql<number>`count(*)::int`,
        })
        .from(installations)
        .where(conditions)
        .groupBy(installations.method)

      const total = stats.reduce((sum, s) => sum + s.count, 0)

      return NextResponse.json({
        itemId,
        period,
        total,
        byMethod: Object.fromEntries(stats.map(s => [s.method, s.count])),
      })
    } else {
      // Get top installed items
      const conditions = startDate ? gte(installations.createdAt, startDate) : undefined

      const topItems = await db
        .select({
          itemId: installations.itemId,
          count: sql<number>`count(*)::int`,
        })
        .from(installations)
        .where(conditions)
        .groupBy(installations.itemId)
        .orderBy(desc(sql`count(*)`))
        .limit(20)

      // Get item details
      const itemIds = topItems.map(t => t.itemId)
      const items = itemIds.length > 0
        ? await db
            .select({
              id: catalogItems.id,
              name: catalogItems.name,
              type: catalogItems.type,
            })
            .from(catalogItems)
            .where(sql`${catalogItems.id} = ANY(${itemIds})`)
        : []

      const itemMap = new Map(items.map(i => [i.id, i]))

      return NextResponse.json({
        period,
        items: topItems.map(t => ({
          ...itemMap.get(t.itemId),
          installs: t.count,
        })),
      })
    }
  } catch (error) {
    log.error('Failed to fetch installation stats', error)
    return ApiErrors.internalError('Failed to fetch installation stats')
  }
}
