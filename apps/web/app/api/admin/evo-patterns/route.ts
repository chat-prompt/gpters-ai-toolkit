/**
 * Admin API for EvoSkill failure patterns
 *
 * GET  — List patterns with optional status/type filter
 * PATCH — Update pattern status (dismiss, re-open, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, evoFailurePatterns } from '@/lib/db'
import { ApiErrors, requirePermissionAsync } from '@/lib/utils/api-utils'
import { Permissions } from '@/lib/security/rbac'
import { eq, desc, and, sql } from 'drizzle-orm'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:admin:evo-patterns')

export async function GET(request: NextRequest) {
  const permissionError = await requirePermissionAsync(Permissions.ADMIN_VIEW, request)
  if (permissionError) return permissionError

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const type = url.searchParams.get('type')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    const conditions = []
    if (status) conditions.push(eq(evoFailurePatterns.status, status as 'pending'))
    if (type) conditions.push(eq(evoFailurePatterns.patternType, type as 'zero_result_cluster'))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [patterns, countResult] = await Promise.all([
      db
        .select()
        .from(evoFailurePatterns)
        .where(where)
        .orderBy(desc(evoFailurePatterns.createdAt))
        .limit(limit)
        .offset(offset),
      db.execute<{ count: string }>(
        sql`SELECT COUNT(*)::text AS count FROM evo_failure_patterns ${
          where ? sql`WHERE ${where}` : sql``
        }`
      ),
    ])

    const total = parseInt(countResult.rows[0]?.count || '0', 10)

    return NextResponse.json({
      patterns,
      meta: { total, limit, offset },
    })
  } catch (error) {
    log.error('Failed to list evo patterns', error)
    return ApiErrors.internalError('Failed to list evo patterns')
  }
}

export async function PATCH(request: NextRequest) {
  const permissionError = await requirePermissionAsync(Permissions.ADMIN_SETTINGS, request)
  if (permissionError) return permissionError

  try {
    const body = await request.json()
    const { id, status } = body as { id: string; status: string }

    if (!id || !status) {
      return ApiErrors.badRequest('id and status are required')
    }

    const validStatuses = ['pending', 'processing', 'resolved', 'dismissed']
    if (!validStatuses.includes(status)) {
      return ApiErrors.badRequest(`status must be one of: ${validStatuses.join(', ')}`)
    }

    const updated = await db
      .update(evoFailurePatterns)
      .set({
        status: status as 'pending',
        ...(status === 'resolved' || status === 'dismissed'
          ? { resolvedAt: new Date() }
          : {}),
      })
      .where(eq(evoFailurePatterns.id, id))
      .returning()

    if (updated.length === 0) {
      return ApiErrors.notFound('Pattern')
    }

    return NextResponse.json({ pattern: updated[0] })
  } catch (error) {
    log.error('Failed to update evo pattern', error)
    return ApiErrors.internalError('Failed to update evo pattern')
  }
}
