/**
 * Version Rollback API
 *
 * POST /api/versions/[itemId]/rollback - Rollback to a previous version
 * GET /api/versions/[itemId]/rollback?targetVersionId=xxx - Preview rollback changes
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { catalogItems } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  rollbackToVersion,
  previewRollback,
  getVersion,
} from '@/lib/versioning/skill-version'

interface RouteParams {
  params: Promise<{ itemId: string }>
}

/**
 * GET /api/versions/[itemId]/rollback?targetVersionId=xxx
 * Preview what would change if rolling back to a version
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { itemId } = await params
    const { searchParams } = new URL(request.url)
    const targetVersionId = searchParams.get('targetVersionId')

    if (!targetVersionId) {
      return NextResponse.json(
        { error: 'targetVersionId is required' },
        { status: 400 }
      )
    }

    // Verify item exists
    const [item] = await db
      .select({ id: catalogItems.id, name: catalogItems.name })
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId))
      .limit(1)

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    // Get target version details
    const targetVersion = await getVersion(targetVersionId)
    if (!targetVersion) {
      return NextResponse.json(
        { error: 'Target version not found' },
        { status: 404 }
      )
    }

    // Verify target version belongs to this item
    if (targetVersion.itemId !== itemId) {
      return NextResponse.json(
        { error: 'Target version does not belong to this item' },
        { status: 400 }
      )
    }

    const preview = await previewRollback(itemId, targetVersionId)

    return NextResponse.json({
      itemId,
      itemName: item.name,
      preview,
      targetVersion: {
        id: targetVersion.id,
        version: targetVersion.version,
        changelog: targetVersion.changelog,
        createdAt: targetVersion.createdAt,
      },
    })
  } catch (error) {
    console.error('Error previewing rollback:', error)
    return NextResponse.json(
      { error: 'Failed to preview rollback' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/versions/[itemId]/rollback
 * Rollback to a previous version
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { itemId } = await params
    const body = await request.json()
    const { targetVersionId, createdBy, createNewVersion = true } = body as {
      targetVersionId: string
      createdBy?: string
      createNewVersion?: boolean
    }

    if (!targetVersionId) {
      return NextResponse.json(
        { error: 'targetVersionId is required' },
        { status: 400 }
      )
    }

    // Verify item exists
    const [item] = await db
      .select({ id: catalogItems.id, name: catalogItems.name })
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId))
      .limit(1)

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    // Get target version details
    const targetVersion = await getVersion(targetVersionId)
    if (!targetVersion) {
      return NextResponse.json(
        { error: 'Target version not found' },
        { status: 404 }
      )
    }

    // Verify target version belongs to this item
    if (targetVersion.itemId !== itemId) {
      return NextResponse.json(
        { error: 'Target version does not belong to this item' },
        { status: 400 }
      )
    }

    // Perform rollback
    const result = await rollbackToVersion({
      itemId,
      targetVersionId,
      createdBy,
      createNewVersion,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      newVersion: result.newVersion,
      itemId,
      itemName: item.name,
      rolledBackTo: targetVersion.version,
    })
  } catch (error) {
    console.error('Error performing rollback:', error)
    return NextResponse.json(
      { error: 'Failed to perform rollback' },
      { status: 500 }
    )
  }
}
