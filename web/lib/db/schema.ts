import { pgTable, text, timestamp, pgEnum, integer, boolean } from 'drizzle-orm/pg-core'

export const itemTypeEnum = pgEnum('item_type', [
  'skill',
  'agent',
  'prompt',
  'command',
  'guide',
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

  // Marketplace integration fields
  marketplaceEnabled: boolean('marketplace_enabled').default(false),
  marketplaceSyncedAt: timestamp('marketplace_synced_at', { withTimezone: true }),
  marketplaceVersion: text('marketplace_version').default('1.0.0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type CatalogItemRecord = typeof catalogItems.$inferSelect
export type NewCatalogItemRecord = typeof catalogItems.$inferInsert
