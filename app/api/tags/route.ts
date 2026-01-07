/**
 * Tags API route
 *
 * GET: List all tags
 * POST: Create a new tag (requires METADATA_MANAGE permission)
 * PATCH: Update an existing tag (requires METADATA_MANAGE permission)
 * DELETE: Delete a tag (requires METADATA_MANAGE permission)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, tags } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ApiErrors, requirePermissionAsync, validateRequired, apiSuccess } from '@/lib/utils/api-utils'
import { Permissions } from '@/lib/security/rbac'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:tags')

// GET /api/tags - List all tags
export async function GET() {
  try {
    const allTags = await db.select().from(tags).orderBy(tags.label)
    return NextResponse.json(allTags)
  } catch (error) {
    log.error('Failed to fetch tags', error)
    return ApiErrors.internalError('Failed to fetch tags')
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  const authError = await requirePermissionAsync(Permissions.METADATA_MANAGE, request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { id, label, color, description } = body

    const validation = validateRequired(body, ['id', 'label'])
    if (!validation.valid) {
      return ApiErrors.badRequest(`Missing required fields: ${validation.missing.join(', ')}`)
    }

    // Check if tag already exists
    const existing = await db.select().from(tags).where(eq(tags.id, id))
    if (existing.length > 0) {
      return ApiErrors.conflict('Tag with this ID already exists')
    }

    const [newTag] = await db.insert(tags).values({
      id,
      label,
      color: color || 'bg-gray-100 text-gray-800',
      description: description || null,
    }).returning()

    return apiSuccess(newTag, 201)
  } catch (error) {
    log.error('Failed to create tag', error)
    return ApiErrors.internalError('Failed to create tag')
  }
}
