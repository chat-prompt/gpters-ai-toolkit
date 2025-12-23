import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty } from '@/lib/types'

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

  const { id, type, name, description, author, tags, difficulty, pluginId, estimatedTime, content, readme } = body

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
  }

  await db.insert(catalogItems).values(newItem)

  return NextResponse.json(newItem, { status: 201 })
}
