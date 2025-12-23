import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Increment likes count
    const [updated] = await db
      .update(catalogItems)
      .set({
        likes: sql`${catalogItems.likes} + 1`,
      })
      .where(eq(catalogItems.id, id))
      .returning({ likes: catalogItems.likes })

    if (!updated) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ likes: updated.likes })
  } catch (error) {
    console.error('Error updating likes:', error)
    return NextResponse.json({ error: 'Failed to update likes' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [item] = await db
      .select({ likes: catalogItems.likes })
      .from(catalogItems)
      .where(eq(catalogItems.id, id))

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ likes: item.likes })
  } catch (error) {
    console.error('Error getting likes:', error)
    return NextResponse.json({ error: 'Failed to get likes' }, { status: 500 })
  }
}
