import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty } from '@/lib/types'

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
  if (body.difficulty !== undefined) updateData.difficulty = body.difficulty as Difficulty
  if (body.pluginId !== undefined) updateData.pluginId = body.pluginId
  if (body.estimatedTime !== undefined) updateData.estimatedTime = body.estimatedTime
  if (body.content !== undefined) updateData.content = body.content
  if (body.readme !== undefined) updateData.readme = body.readme
  if (body.type !== undefined) updateData.type = body.type as ItemType

  await db.update(catalogItems).set(updateData).where(eq(catalogItems.id, id))

  const [updated] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

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

  await db.delete(catalogItems).where(eq(catalogItems.id, id))

  return NextResponse.json({ success: true })
}
