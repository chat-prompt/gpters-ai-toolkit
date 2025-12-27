import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import { ApiErrors } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:likes')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Increment likes count
    const [updated] = await db
      .update(catalogItems)
      .set({
        likes: sql`${catalogItems.likes} + 1`,
      })
      .where(eq(catalogItems.id, id))
      .returning({ likes: catalogItems.likes })

    if (!updated) {
      return ApiErrors.notFound('Item')
    }

    return NextResponse.json({ likes: updated.likes })
  } catch (error) {
    log.error('Failed to update likes', error)
    return ApiErrors.internalError('Failed to update likes')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [item] = await db
      .select({ likes: catalogItems.likes })
      .from(catalogItems)
      .where(eq(catalogItems.id, id))

    if (!item) {
      return ApiErrors.notFound('Item')
    }

    return NextResponse.json({ likes: item.likes })
  } catch (error) {
    log.error('Failed to get likes', error)
    return ApiErrors.internalError('Failed to get likes')
  }
}
