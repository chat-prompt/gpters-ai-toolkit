/**
 * Admin API for EvoSkill draft management
 *
 * GET  — List evo-generated draft skills with funnel metrics
 * PATCH — Manual promote/retire
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, catalogItems } from '@/lib/db'
import { ApiErrors, requirePermissionAsync } from '@/lib/utils/api-utils'
import { Permissions } from '@/lib/security/rbac'
import { eq, and, desc } from 'drizzle-orm'
import { getSkillFunnelStats } from '@/lib/analytics'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:admin:evo-drafts')

export async function GET(request: NextRequest) {
  const permissionError = await requirePermissionAsync(Permissions.ADMIN_VIEW, request)
  if (permissionError) return permissionError

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'draft'

    const drafts = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        description: catalogItems.description,
        status: catalogItems.status,
        evoPatternId: catalogItems.evoPatternId,
        createdAt: catalogItems.createdAt,
        updatedAt: catalogItems.updatedAt,
      })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.evoGenerated, true),
          ...(status !== 'all' ? [eq(catalogItems.status, status)] : [])
        )
      )
      .orderBy(desc(catalogItems.createdAt))
      .limit(100)

    // Enrich with funnel stats
    const funnelStats = await getSkillFunnelStats({ period: '30d' })
    const funnelMap = new Map(funnelStats.map((s) => [s.skillId, s]))

    const enriched = drafts.map((d) => {
      const funnel = funnelMap.get(d.id)
      const ageDays = d.createdAt
        ? Math.floor((Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0

      return {
        ...d,
        ageDays,
        funnel: funnel
          ? {
              searches: funnel.searches,
              loads: funnel.loads,
              applies: funnel.applies,
              skips: funnel.skips,
              searchToLoadRate: funnel.searchToLoadRate,
              loadToApplyRate: funnel.loadToApplyRate,
            }
          : null,
      }
    })

    return NextResponse.json({ drafts: enriched })
  } catch (error) {
    log.error('Failed to list evo drafts', error)
    return ApiErrors.internalError('Failed to list evo drafts')
  }
}

export async function PATCH(request: NextRequest) {
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_EDIT, request)
  if (permissionError) return permissionError

  try {
    const body = await request.json()
    const { id, action } = body as { id: string; action: 'promote' | 'retire' }

    if (!id || !action) {
      return ApiErrors.badRequest('id and action are required')
    }

    if (action !== 'promote' && action !== 'retire') {
      return ApiErrors.badRequest('action must be "promote" or "retire"')
    }

    const newStatus = action === 'promote' ? 'published' : 'retired'

    const updated = await db
      .update(catalogItems)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(
        and(
          eq(catalogItems.id, id),
          eq(catalogItems.evoGenerated, true)
        )
      )
      .returning({ id: catalogItems.id, name: catalogItems.name, status: catalogItems.status })

    if (updated.length === 0) {
      return ApiErrors.notFound('Evo draft skill')
    }

    return NextResponse.json({ skill: updated[0], action })
  } catch (error) {
    log.error('Failed to update evo draft', error)
    return ApiErrors.internalError('Failed to update evo draft')
  }
}
