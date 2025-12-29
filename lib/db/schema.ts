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

// User roles for RBAC
export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'viewer'])

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
  role: userRoleEnum('role').notNull().default('viewer'),
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

// ============================================
// MCP API Tokens Table
// ============================================

export const mcpTokens = pgTable('mcp_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 hash of the token
  name: text('name').notNull(), // Human-readable name/description
  description: text('description'), // Optional longer description
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = never expires
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').notNull().default(0),
  rateLimit: integer('rate_limit').default(100), // requests per minute
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('mcp_tokens_token_hash_idx').on(table.tokenHash),
  index('mcp_tokens_is_active_idx').on(table.isActive),
])

export type McpTokenRecord = typeof mcpTokens.$inferSelect
export type NewMcpTokenRecord = typeof mcpTokens.$inferInsert

// ============================================
// Item Version History Table
// ============================================

export const versionTypeEnum = pgEnum('version_type', ['major', 'minor', 'patch'])

export const itemVersions = pgTable('item_versions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId: text('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  version: text('version').notNull(), // semver format: "1.0.0"
  versionType: versionTypeEnum('version_type').notNull(), // major | minor | patch

  // Snapshot of the item at this version
  content: text('content').notNull(),
  changelog: text('changelog'), // What changed in this version

  // Metadata
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),

  // Additional snapshot data for rollback
  snapshotData: jsonb('snapshot_data').$type<{
    name?: string
    description?: string
    allowedTools?: string
    dependencies?: string[]
    files?: Array<{ name: string; content: string; type?: string }>
    [key: string]: unknown
  }>(),
}, (table) => [
  index('item_versions_item_id_idx').on(table.itemId),
  index('item_versions_version_idx').on(table.version),
  index('item_versions_created_at_idx').on(table.createdAt),
])

export type ItemVersionRecord = typeof itemVersions.$inferSelect
export type NewItemVersionRecord = typeof itemVersions.$inferInsert

// Relations for item versions
export const itemVersionsRelations = relations(itemVersions, ({ one }) => ({
  item: one(catalogItems, {
    fields: [itemVersions.itemId],
    references: [catalogItems.id],
  }),
  createdByUser: one(users, {
    fields: [itemVersions.createdBy],
    references: [users.id],
  }),
}))

// ============================================
// Comments Table
// ============================================

export const comments = pgTable('comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId: text('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'), // For nested comments (replies)
  content: text('content').notNull(),
  likes: integer('likes').notNull().default(0),
  isEdited: boolean('is_edited').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('comments_item_id_idx').on(table.itemId),
  index('comments_user_id_idx').on(table.userId),
  index('comments_parent_id_idx').on(table.parentId),
  index('comments_created_at_idx').on(table.createdAt),
])

export type CommentRecord = typeof comments.$inferSelect
export type NewCommentRecord = typeof comments.$inferInsert

// Comment Likes Table (tracks who liked which comment)
export const commentLikes = pgTable('comment_likes', {
  commentId: text('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.commentId, table.userId] }),
])

export type CommentLikeRecord = typeof commentLikes.$inferSelect
export type NewCommentLikeRecord = typeof commentLikes.$inferInsert

// Relations for comments
export const commentsRelations = relations(comments, ({ one, many }) => ({
  item: one(catalogItems, {
    fields: [comments.itemId],
    references: [catalogItems.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'parentChild',
  }),
  replies: many(comments, { relationName: 'parentChild' }),
  likes: many(commentLikes),
}))

export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(comments, {
    fields: [commentLikes.commentId],
    references: [comments.id],
  }),
  user: one(users, {
    fields: [commentLikes.userId],
    references: [users.id],
  }),
}))
