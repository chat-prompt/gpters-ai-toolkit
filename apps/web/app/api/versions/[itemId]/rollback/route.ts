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
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import {
  rollbackToVersion,
  previewRollback,
  getVersion,
} from '@/lib/versioning/skill-version'

const log = createLogger('api:versions:rollback')

interface RouteParams {
  params: Promise<{ itemId: string }>
}

/**
 * GET /api/versions/[itemId]/rollback?targetVersionId=xxx
 * Preview what would change if rolling back to a version
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return ApiErrors.unauthorized()

  try {
    const { itemId } = await params
    const { searchParams } = new URL(request.url)
    const targetVersionId = searchParams.get('targetVersionId')

    if (!targetVersionId) {
      return ApiErrors.badRequest('targetVersionId is required')
    }

    // Verify item exists
    const [item] = await db
      .select({ id: catalogItems.id, name: catalogItems.name })
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId))
      .limit(1)

    if (!item) {
      return ApiErrors.notFound('Item')
    }

    // Get target version details
    const targetVersion = await getVersion(targetVersionId)
    if (!targetVersion) {
      return ApiErrors.notFound('Target version')
    }

    // Verify target version belongs to this item
    if (targetVersion.itemId !== itemId) {
      return ApiErrors.badRequest('Target version does not belong to this item')
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
    log.error('Failed to preview rollback', error, { itemId: (await params).itemId })
    return ApiErrors.internalError()
  }
}

/**
 * POST /api/versions/[itemId]/rollback
 * Rollback to a previous version
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return ApiErrors.unauthorized()

  try {
    const { itemId } = await params
    const body = await request.json()
    const { targetVersionId, createdBy, createNewVersion = true } = body as {
      targetVersionId: string
      createdBy?: string
      createNewVersion?: boolean
    }

    if (!targetVersionId) {
      return ApiErrors.badRequest('targetVersionId is required')
    }

    // Verify item exists
    const [item] = await db
      .select({ id: catalogItems.id, name: catalogItems.name })
      .from(catalogItems)
      .where(eq(catalogItems.id, itemId))
      .limit(1)

    if (!item) {
      return ApiErrors.notFound('Item')
    }

    // Get target version details
    const targetVersion = await getVersion(targetVersionId)
    if (!targetVersion) {
      return ApiErrors.notFound('Target version')
    }

    // Verify target version belongs to this item
    if (targetVersion.itemId !== itemId) {
      return ApiErrors.badRequest('Target version does not belong to this item')
    }

    // Perform rollback
    const result = await rollbackToVersion({
      itemId,
      targetVersionId,
      createdBy,
      createNewVersion,
    })

    if (!result.success) {
      return ApiErrors.badRequest(result.message)
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
    log.error('Failed to perform rollback', error, { itemId: (await params).itemId })
    return ApiErrors.internalError()
  }
}
