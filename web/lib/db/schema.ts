import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const itemTypeEnum = pgEnum('item_type', [
  'skill',
  'agent',
  'prompt',
  'command',
  'guide',
])

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard'])

export const catalogItems = pgTable('catalog_items', {
  id: text('id').primaryKey(),
  type: itemTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  author: text('author').notNull().default('unknown'),
  tags: text('tags').array().default([]),
  difficulty: difficultyEnum('difficulty'),
  pluginId: text('plugin_id'),
  estimatedTime: text('estimated_time'),
  content: text('content').notNull(),
  readme: text('readme'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type CatalogItemRecord = typeof catalogItems.$inferSelect
export type NewCatalogItemRecord = typeof catalogItems.$inferInsert
