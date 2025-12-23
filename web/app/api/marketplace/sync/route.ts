import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import { syncAllToGitHub } from '@/lib/marketplace'

/**
 * POST /api/marketplace/sync
 * Trigger full sync of all marketplace-enabled items to GitHub
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  // Admin authentication
  const adminPassword = request.headers.get('x-admin-password')

  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all marketplace-enabled items
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

    // Sync to GitHub
    const result = await syncAllToGitHub(catalogItemsList)

    // Update sync timestamps for successful items
    if (result.success) {
      await db
        .update(catalogItems)
        .set({ marketplaceSyncedAt: new Date() })
        .where(eq(catalogItems.marketplaceEnabled, true))
    }

    return NextResponse.json({
      success: result.success,
      syncedAt: result.syncedAt.toISOString(),
      stats: {
        filesCreated: result.filesCreated.length,
        filesUpdated: result.filesUpdated.length,
        filesDeleted: result.filesDeleted.length,
        errors: result.errors.length,
      },
      details: {
        filesCreated: result.filesCreated,
        filesUpdated: result.filesUpdated,
        filesDeleted: result.filesDeleted,
        errors: result.errors,
      },
    })
  } catch (error) {
    console.error('Marketplace sync error:', error)
    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
