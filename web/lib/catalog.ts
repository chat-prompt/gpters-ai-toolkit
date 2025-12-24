import { eq, ne } from 'drizzle-orm'
import { db, catalogItems } from './db'
import { CatalogItem, ItemType } from './types'

function toPlainObject(record: typeof catalogItems.$inferSelect): CatalogItem {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    description: record.description,
    author: record.author,
    tags: record.tags || [],
    teamTag: (record.teamTag as CatalogItem['teamTag']) ?? undefined,
    difficulty: record.difficulty ?? undefined,
    pluginId: record.pluginId ?? undefined,
    estimatedTime: record.estimatedTime ?? undefined,
    dependencies: record.dependencies || [],
    likes: record.likes,
    content: record.content,
    readme: record.readme ?? undefined,
    // Type-specific fields
    allowedTools: record.allowedTools ?? undefined,
    agentModel: (record.agentModel as CatalogItem['agentModel']) ?? undefined,
    agentPermissionMode: (record.agentPermissionMode as CatalogItem['agentPermissionMode']) ?? undefined,
    agentSkills: record.agentSkills ?? undefined,
    commandArgumentHint: record.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: record.commandDisableModelInvocation ?? undefined,
    // Marketplace fields
    marketplaceEnabled: record.marketplaceEnabled ?? false,
    marketplaceSyncedAt: record.marketplaceSyncedAt?.toISOString(),
    marketplaceVersion: record.marketplaceVersion ?? undefined,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  }
}

export async function getCatalog(): Promise<CatalogItem[]> {
  // Get all items except guides (they have their own page)
  const records = await db
    .select()
    .from(catalogItems)
    .where(ne(catalogItems.type, 'guide'))

  return records.map(toPlainObject)
}

export async function getItemById(id: string): Promise<CatalogItem | undefined> {
  const [record] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

  if (!record) return undefined
  return toPlainObject(record)
}

export async function getItemsByType(type: ItemType): Promise<CatalogItem[]> {
  const records = await db.select().from(catalogItems).where(eq(catalogItems.type, type))
  return records.map(toPlainObject)
}

export async function getGuides(): Promise<CatalogItem[]> {
  const records = await db.select().from(catalogItems).where(eq(catalogItems.type, 'guide'))
  return records.map(toPlainObject)
}

export async function getGuideById(id: string): Promise<CatalogItem | undefined> {
  const [record] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))

  if (!record || record.type !== 'guide') return undefined
  return toPlainObject(record)
}

export async function getBeginnerItems(): Promise<CatalogItem[]> {
  // Get items suitable for beginners (easy difficulty or beginner tag)
  const records = await db.select().from(catalogItems)

  return records
    .map(toPlainObject)
    .filter(
      (item) =>
        item.difficulty === 'easy' ||
        item.tags.includes('beginner') ||
        item.tags.includes('입문')
    )
}
