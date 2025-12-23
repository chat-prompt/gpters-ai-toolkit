import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty } from '@/lib/types'
import { syncItemToGitHub, updateMarketplaceJson } from '@/lib/marketplace'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') as ItemType | null

  const items = type
    ? await db.select().from(catalogItems).where(eq(catalogItems.type, type))
    : await db.select().from(catalogItems)

  return NextResponse.json(items)
}

export async function POST(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password')

  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { id, type, name, description, author, tags, difficulty, pluginId, estimatedTime, content, readme, marketplaceEnabled, marketplaceVersion } = body

  if (!id || !type || !name || !content) {
    return NextResponse.json(
      { error: 'Missing required fields: id, type, name, content' },
      { status: 400 }
    )
  }

  const newItem = {
    id,
    type: type as ItemType,
    name,
    description: description || '',
    author: author || 'unknown',
    tags: tags || [],
    difficulty: difficulty as Difficulty | null,
    pluginId: pluginId || null,
    estimatedTime: estimatedTime || null,
    content,
    readme: readme || null,
    marketplaceEnabled: marketplaceEnabled || false,
    marketplaceVersion: marketplaceVersion || '1.0.0',
  }

  await db.insert(catalogItems).values(newItem)

  // Auto-sync to GitHub if marketplace is enabled
  if (newItem.marketplaceEnabled && newItem.type !== 'guide') {
    try {
      const catalogItem = {
        ...newItem,
        likes: 0,
        dependencies: [],
        difficulty: newItem.difficulty ?? undefined,
        pluginId: newItem.pluginId ?? undefined,
        estimatedTime: newItem.estimatedTime ?? undefined,
        readme: newItem.readme ?? undefined,
        marketplaceEnabled: newItem.marketplaceEnabled ?? undefined,
        marketplaceVersion: newItem.marketplaceVersion ?? undefined,
      }
      await syncItemToGitHub(catalogItem)

      // Update marketplace.json
      const allItems = await db.select().from(catalogItems).where(eq(catalogItems.marketplaceEnabled, true))
      const allCatalogItems = allItems.map(item => ({
        ...item,
        tags: item.tags || [],
        dependencies: item.dependencies || [],
        difficulty: item.difficulty ?? undefined,
        pluginId: item.pluginId ?? undefined,
        estimatedTime: item.estimatedTime ?? undefined,
        readme: item.readme ?? undefined,
        marketplaceEnabled: item.marketplaceEnabled ?? undefined,
        marketplaceVersion: item.marketplaceVersion ?? undefined,
        createdAt: item.createdAt?.toISOString(),
        updatedAt: item.updatedAt?.toISOString(),
        marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
      }))
      await updateMarketplaceJson(allCatalogItems)

      // Update sync timestamp
      await db.update(catalogItems).set({ marketplaceSyncedAt: new Date() }).where(eq(catalogItems.id, id))
    } catch (error) {
      console.error('Failed to sync to marketplace:', error)
      // Don't fail the insert if sync fails
    }
  }

  return NextResponse.json(newItem, { status: 201 })
}
