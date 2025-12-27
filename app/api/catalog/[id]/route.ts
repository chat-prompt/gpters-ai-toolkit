import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, HookEvent } from '@/lib/types'
import { syncItemToGitHub, deleteItemFromGitHub, updateMarketplaceJson } from '@/lib/marketplace'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  const [item] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(item)
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const adminPassword = request.headers.get('x-admin-password')

  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.author !== undefined) updateData.author = body.author
  if (body.tags !== undefined) updateData.tags = body.tags
  if (body.teamTag !== undefined) updateData.teamTag = body.teamTag as TeamTag
  if (body.difficulty !== undefined) updateData.difficulty = body.difficulty as Difficulty
  if (body.pluginId !== undefined) updateData.pluginId = body.pluginId
  if (body.estimatedTime !== undefined) updateData.estimatedTime = body.estimatedTime
  if (body.content !== undefined) updateData.content = body.content
  if (body.readme !== undefined) updateData.readme = body.readme
  if (body.files !== undefined) updateData.files = body.files
  if (body.type !== undefined) updateData.type = body.type as ItemType
  // Marketplace fields
  if (body.marketplaceEnabled !== undefined) updateData.marketplaceEnabled = body.marketplaceEnabled
  if (body.marketplaceVersion !== undefined) updateData.marketplaceVersion = body.marketplaceVersion
  // V2: Status and changelog
  if (body.status !== undefined) updateData.status = body.status
  if (body.changelog !== undefined) updateData.changelog = body.changelog

  await db.update(catalogItems).set(updateData).where(eq(catalogItems.id, id))

  const [updated] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

  // Auto-sync to GitHub if marketplace is enabled
  if (updated.marketplaceEnabled && updated.type !== 'guide') {
    try {
      const catalogItem = {
        ...updated,
        tags: updated.tags || [],
        dependencies: updated.dependencies || [],
        teamTag: updated.teamTag ?? undefined,
        difficulty: updated.difficulty ?? undefined,
        pluginId: updated.pluginId ?? undefined,
        estimatedTime: updated.estimatedTime ?? undefined,
        readme: updated.readme ?? undefined,
        files: updated.files ?? undefined,
        allowedTools: updated.allowedTools ?? undefined,
        agentModel: (updated.agentModel ?? undefined) as import('@/lib/types').AgentModel | undefined,
        agentPermissionMode: (updated.agentPermissionMode ?? undefined) as import('@/lib/types').AgentPermissionMode | undefined,
        agentSkills: updated.agentSkills ?? undefined,
        commandArgumentHint: updated.commandArgumentHint ?? undefined,
        commandDisableModelInvocation: updated.commandDisableModelInvocation ?? undefined,
        hookEvent: (updated.hookEvent ?? undefined) as HookEvent | undefined,
        hookMatcher: updated.hookMatcher ?? undefined,
        hookCommand: updated.hookCommand ?? undefined,
        hookTimeout: updated.hookTimeout ?? undefined,
        hookBlocking: updated.hookBlocking ?? undefined,
        marketplaceEnabled: updated.marketplaceEnabled ?? undefined,
        marketplaceVersion: updated.marketplaceVersion ?? undefined,
        status: (updated.status as 'draft' | 'published') ?? 'published',
        changelog: updated.changelog ?? undefined,
        createdAt: updated.createdAt?.toISOString(),
        updatedAt: updated.updatedAt?.toISOString(),
        marketplaceSyncedAt: updated.marketplaceSyncedAt?.toISOString(),
      }
      await syncItemToGitHub(catalogItem)

      // Update marketplace.json
      const allItems = await db.select().from(catalogItems).where(eq(catalogItems.marketplaceEnabled, true))
      const allCatalogItems = allItems.map(item => ({
        ...item,
        tags: item.tags || [],
        dependencies: item.dependencies || [],
        teamTag: item.teamTag ?? undefined,
        difficulty: item.difficulty ?? undefined,
        pluginId: item.pluginId ?? undefined,
        estimatedTime: item.estimatedTime ?? undefined,
        readme: item.readme ?? undefined,
        files: item.files ?? undefined,
        allowedTools: item.allowedTools ?? undefined,
        agentModel: (item.agentModel ?? undefined) as import('@/lib/types').AgentModel | undefined,
        agentPermissionMode: (item.agentPermissionMode ?? undefined) as import('@/lib/types').AgentPermissionMode | undefined,
        agentSkills: item.agentSkills ?? undefined,
        commandArgumentHint: item.commandArgumentHint ?? undefined,
        commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
        hookEvent: (item.hookEvent ?? undefined) as HookEvent | undefined,
        hookMatcher: item.hookMatcher ?? undefined,
        hookCommand: item.hookCommand ?? undefined,
        hookTimeout: item.hookTimeout ?? undefined,
        hookBlocking: item.hookBlocking ?? undefined,
        marketplaceEnabled: item.marketplaceEnabled ?? undefined,
        marketplaceVersion: item.marketplaceVersion ?? undefined,
        status: (item.status as 'draft' | 'published') ?? 'published',
        changelog: item.changelog ?? undefined,
        createdAt: item.createdAt?.toISOString(),
        updatedAt: item.updatedAt?.toISOString(),
        marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
      }))
      await updateMarketplaceJson(allCatalogItems)

      // Update sync timestamp
      await db.update(catalogItems).set({ marketplaceSyncedAt: new Date() }).where(eq(catalogItems.id, id))
    } catch (error) {
      console.error('Failed to sync to marketplace:', error)
      // Don't fail the update if sync fails
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const adminPassword = request.headers.get('x-admin-password')

  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete from marketplace if it was enabled
  if (existing.marketplaceEnabled) {
    try {
      await deleteItemFromGitHub(id)

      // Update marketplace.json
      const allItems = await db.select().from(catalogItems).where(eq(catalogItems.marketplaceEnabled, true))
      const remainingItems = allItems.filter(item => item.id !== id).map(item => ({
        ...item,
        tags: item.tags || [],
        dependencies: item.dependencies || [],
        teamTag: item.teamTag ?? undefined,
        difficulty: item.difficulty ?? undefined,
        pluginId: item.pluginId ?? undefined,
        estimatedTime: item.estimatedTime ?? undefined,
        readme: item.readme ?? undefined,
        files: item.files ?? undefined,
        allowedTools: item.allowedTools ?? undefined,
        agentModel: (item.agentModel ?? undefined) as import('@/lib/types').AgentModel | undefined,
        agentPermissionMode: (item.agentPermissionMode ?? undefined) as import('@/lib/types').AgentPermissionMode | undefined,
        agentSkills: item.agentSkills ?? undefined,
        commandArgumentHint: item.commandArgumentHint ?? undefined,
        commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
        hookEvent: (item.hookEvent ?? undefined) as HookEvent | undefined,
        hookMatcher: item.hookMatcher ?? undefined,
        hookCommand: item.hookCommand ?? undefined,
        hookTimeout: item.hookTimeout ?? undefined,
        hookBlocking: item.hookBlocking ?? undefined,
        marketplaceEnabled: item.marketplaceEnabled ?? undefined,
        marketplaceVersion: item.marketplaceVersion ?? undefined,
        status: (item.status as 'draft' | 'published') ?? 'published',
        changelog: item.changelog ?? undefined,
        createdAt: item.createdAt?.toISOString(),
        updatedAt: item.updatedAt?.toISOString(),
        marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
      }))
      await updateMarketplaceJson(remainingItems)
    } catch (error) {
      console.error('Failed to delete from marketplace:', error)
      // Don't fail the delete if marketplace sync fails
    }
  }

  await db.delete(catalogItems).where(eq(catalogItems.id, id))

  return NextResponse.json({ success: true })
}
