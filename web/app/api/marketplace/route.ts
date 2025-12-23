import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import { generateMarketplaceJson } from '@/lib/marketplace'

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
    createdAt: item.createdAt?.toISOString(),
    updatedAt: item.updatedAt?.toISOString(),
    marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
  }))

  const marketplaceJson = generateMarketplaceJson(catalogItemsList)

  return NextResponse.json(marketplaceJson)
}
