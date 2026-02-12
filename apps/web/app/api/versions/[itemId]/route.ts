/**
 * Version History API
 *
 * GET /api/versions/[itemId] - Get version history for an item
 * POST /api/versions/[itemId] - Create a new version snapshot
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { catalogItems } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import {
  getVersionHistory,
  createVersionSnapshot,
  compareWithPreviousVersion,
  type VersionType,
} from '@/lib/versioning/skill-version'

interface RouteParams {
  params: Promise<{ itemId: string }>
}

/**
 * GET /api/versions/[itemId]
 * Get version history for a catalog item
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return ApiErrors.unauthorized()

  try {
    const { itemId } = await params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Verify item exists
    const [item] = await db
      .select({ id: catalogItems.id, type: catalogItems.type })
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId))
      .limit(1)

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    const history = await getVersionHistory(itemId, limit)

    return NextResponse.json({
      itemId,
      itemType: item.type,
      versions: history,
      count: history.length,
    })
  } catch (error) {
    console.error('Error fetching version history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch version history' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/versions/[itemId]
 * Create a new version snapshot
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return ApiErrors.unauthorized()

  try {
    const { itemId } = await params
    const body = await request.json()
    const { version, versionType, changelog } = body as {
      version?: string
      versionType?: VersionType
      changelog?: string
    }
    const createdBy = session.user.id

    // Get current item
    const [item] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId))
      .limit(1)

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    // If no version specified, compare with previous and suggest
    if (!version && !versionType) {
      const comparison = await compareWithPreviousVersion(item)

      if (!comparison.hasChanges) {
        return NextResponse.json({
          created: false,
          message: 'No changes detected since last version',
          currentVersion: item.version,
        })
      }

      // Create version with suggested values
      const newVersion = await createVersionSnapshot(item, {
        version: comparison.suggestedVersion,
        versionType: comparison.changeType as VersionType,
        changelog: changelog || comparison.summary,
        createdBy,
      })

      // Update item's marketplace version
      await db
        .update(catalogItems)
        .set({
          version: comparison.suggestedVersion,
          changelog: changelog || comparison.summary,
          updatedAt: new Date(),
        })
        .where(eq(catalogItems.id, itemId))

      return NextResponse.json({
        created: true,
        version: newVersion,
        suggestedChanges: comparison,
      })
    }

    // Create version with explicit values
    const newVersion = await createVersionSnapshot(item, {
      version,
      versionType,
      changelog,
      createdBy,
    })

    // Update item's marketplace version if version provided
    if (version) {
      await db
        .update(catalogItems)
        .set({
          version: version,
          changelog,
          updatedAt: new Date(),
        })
        .where(eq(catalogItems.id, itemId))
    }

    return NextResponse.json({
      created: true,
      version: newVersion,
    })
  } catch (error) {
    console.error('Error creating version:', error)
    return NextResponse.json(
      { error: 'Failed to create version' },
      { status: 500 }
    )
  }
}
