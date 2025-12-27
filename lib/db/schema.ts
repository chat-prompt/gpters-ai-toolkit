import { pgTable, text, timestamp, pgEnum, integer, boolean, primaryKey, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const itemTypeEnum = pgEnum('item_type', [
  'skill',
  'agent',
  'command',
  'guide',
  'hook',
])

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard'])

// Team tags for categorizing items by team ownership
export const teamTagEnum = pgEnum('team_tag', [
  'platform', // 플랫폼팀
  'ai',       // AI팀
  'data',     // 데이터팀
  'product',  // 프로덕트팀
  'infra',    // 인프라팀
  'general',  // 공통/일반
])

export const catalogItems = pgTable('catalog_items', {
  id: text('id').primaryKey(),
  type: itemTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  author: text('author').notNull().default('unknown'),
  tags: text('tags').array().default([]),
  teamTag: teamTagEnum('team_tag').default('general'),
  difficulty: difficultyEnum('difficulty'),
  pluginId: text('plugin_id'),
  estimatedTime: text('estimated_time'),
  dependencies: text('dependencies').array().default([]), // e.g., ["mcp:github", "skill:git-commit"]
  likes: integer('likes').notNull().default(0),
  content: text('content').notNull(),
  readme: text('readme'),
  // Additional files (scripts, references, etc.) - JSON array of {name, content, type?}
  files: jsonb('files').$type<Array<{ name: string; content: string; type?: string }>>(),

  // Type-specific fields for Claude Code plugins
  // Skill & Command & Agent: allowed tools (comma-separated, e.g., "Read, Grep, Bash")
  allowedTools: text('allowed_tools'),
  // Agent-specific fields
  agentModel: text('agent_model'), // sonnet | opus | haiku | inherit
  agentPermissionMode: text('agent_permission_mode'), // default | acceptEdits | bypassPermissions | plan | ignore
  agentSkills: text('agent_skills'), // comma-separated skill names to load
  // Command-specific fields
  commandArgumentHint: text('command_argument_hint'), // e.g., "[message]"
  commandDisableModelInvocation: boolean('command_disable_model_invocation').default(false),

  // Hook-specific fields
  hookEvent: text('hook_event'), // PreCompact, SessionStart, PreToolUse, PostToolUse, etc.
  hookMatcher: text('hook_matcher'), // auto, manual, startup, resume, compact, tool name, etc.
  hookCommand: text('hook_command'), // Shell command to execute
  hookTimeout: integer('hook_timeout'), // Timeout in milliseconds
  hookBlocking: boolean('hook_blocking').default(true), // Whether hook blocks execution

  // Marketplace integration fields
  marketplaceEnabled: boolean('marketplace_enabled').default(false),
  marketplaceSyncedAt: timestamp('marketplace_synced_at', { withTimezone: true }),
  marketplaceVersion: text('marketplace_version').default('1.0.0'),

  // V2: Status and version management
  status: text('status').default('published'), // 'draft' | 'published'
  changelog: text('changelog'), // Latest version changelog

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  // Performance indexes for common queries
  index('catalog_items_type_idx').on(table.type),
  index('catalog_items_status_idx').on(table.status),
  index('catalog_items_author_idx').on(table.author),
  index('catalog_items_marketplace_enabled_idx').on(table.marketplaceEnabled),
  // Composite index for type + status (common filter combination)
  index('catalog_items_type_status_idx').on(table.type, table.status),
])

export type CatalogItemRecord = typeof catalogItems.$inferSelect
export type NewCatalogItemRecord = typeof catalogItems.$inferInsert

// ============================================
// Users Table (OAuth)
// ============================================

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Google sub ID
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type UserRecord = typeof users.$inferSelect
export type NewUserRecord = typeof users.$inferInsert

// ============================================
// Normalized Tables
// ============================================

// Authors table
export const authors = pgTable('authors', {
  id: text('id').primaryKey(), // slug-style id
  name: text('name').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type AuthorRecord = typeof authors.$inferSelect
export type NewAuthorRecord = typeof authors.$inferInsert

// Tags table
export const tags = pgTable('tags', {
  id: text('id').primaryKey(), // slug-style id (e.g., "writing", "code")
  label: text('label').notNull(), // Display label (e.g., "문서 작성", "코드")
  color: text('color').notNull().default('bg-gray-100 text-gray-800'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type TagRecord = typeof tags.$inferSelect
export type NewTagRecord = typeof tags.$inferInsert

// MCP Servers table
export const mcpServers = pgTable('mcp_servers', {
  id: text('id').primaryKey(), // slug-style id (e.g., "github", "slack")
  label: text('label').notNull(), // Display label (e.g., "GitHub MCP")
  description: text('description').notNull().default(''),
  documentationUrl: text('documentation_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type McpServerRecord = typeof mcpServers.$inferSelect
export type NewMcpServerRecord = typeof mcpServers.$inferInsert

// Junction table for catalog items <-> tags (many-to-many)
export const catalogItemTags = pgTable('catalog_item_tags', {
  itemId: text('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.itemId, table.tagId] }),
])

export type CatalogItemTagRecord = typeof catalogItemTags.$inferSelect
export type NewCatalogItemTagRecord = typeof catalogItemTags.$inferInsert

// ============================================
// Relations
// ============================================

export const catalogItemsRelations = relations(catalogItems, ({ many }) => ({
  itemTags: many(catalogItemTags),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  itemTags: many(catalogItemTags),
}))

export const catalogItemTagsRelations = relations(catalogItemTags, ({ one }) => ({
  item: one(catalogItems, {
    fields: [catalogItemTags.itemId],
    references: [catalogItems.id],
  }),
  tag: one(tags, {
    fields: [catalogItemTags.tagId],
    references: [tags.id],
  }),
}))

// ============================================
// Installation Tracking Table
// ============================================

export const installMethodEnum = pgEnum('install_method', [
  'cli',           // CLI command copied
  'mcp',           // MCP prompt copied
  'plugin',        // Plugin install command copied
  'manual_content', // Manual content copied
  'manual_folder', // Manual folder command copied
  'manual_file',   // Manual file path copied
])

export const installations = pgTable('installations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId: text('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  method: installMethodEnum('method').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('installations_item_id_idx').on(table.itemId),
  index('installations_method_idx').on(table.method),
  index('installations_created_at_idx').on(table.createdAt),
])

export type InstallationRecord = typeof installations.$inferSelect
export type NewInstallationRecord = typeof installations.$inferInsert
