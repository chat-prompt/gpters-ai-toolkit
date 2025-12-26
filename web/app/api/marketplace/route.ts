import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import { generateMarketplaceJson } from '@/lib/marketplace'
import type { HookEvent } from '@/lib/types'

/**
 * GET /api/marketplace
 * Returns marketplace.json format for Claude Code CLI
 */
export async function GET() {
  const items = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.marketplaceEnabled, true))

  // Transform DB records to CatalogItem format
  const catalogItemsList = items.map((item) => ({
    ...item,
    tags: item.tags || [],
    dependencies: item.dependencies || [],
    files: item.files ?? undefined,
    teamTag: item.teamTag ?? undefined,
    difficulty: item.difficulty ?? undefined,
    pluginId: item.pluginId ?? undefined,
    estimatedTime: item.estimatedTime ?? undefined,
    readme: item.readme ?? undefined,
    allowedTools: item.allowedTools ?? undefined,
    agentModel: (item.agentModel ?? undefined) as import('@/lib/types').AgentModel | undefined,
    agentPermissionMode: (item.agentPermissionMode ?? undefined) as import('@/lib/types').AgentPermissionMode | undefined,
    agentSkills: item.agentSkills ?? undefined,
    commandArgumentHint: item.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
    // Hook fields
    hookEvent: (item.hookEvent ?? undefined) as HookEvent | undefined,
    hookMatcher: item.hookMatcher ?? undefined,
    hookCommand: item.hookCommand ?? undefined,
    hookTimeout: item.hookTimeout ?? undefined,
    hookBlocking: item.hookBlocking ?? undefined,
    marketplaceEnabled: item.marketplaceEnabled ?? undefined,
    marketplaceVersion: item.marketplaceVersion ?? undefined,
    createdAt: item.createdAt?.toISOString(),
    updatedAt: item.updatedAt?.toISOString(),
    marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
  }))

  const marketplaceJson = generateMarketplaceJson(catalogItemsList)

  return NextResponse.json(marketplaceJson)
}
