/**
 * Database schema definitions
 *
 * Drizzle ORM schema for PostgreSQL including tables for
 * catalog items, users, tags, MCP servers, and related entities.
 */
import { pgTable, text, timestamp, pgEnum, integer, boolean, primaryKey, jsonb, index, halfvec, real } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const itemTypeEnum = pgEnum('item_type', [
  'skill',
  'agent',
  'command',
  'guide',
  'hook',
  'package',
])

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard'])

// User roles for RBAC
export const userRoleEnum = pgEnum('user_role', ['super_admin', 'admin', 'editor', 'viewer'])

/**
 * Organization role enum for organization memberships
 */
export const orgRoleEnum = pgEnum('org_role', ['org_admin', 'org_editor', 'org_viewer'])

/**
 * Visibility enum for catalog items
 */
export const visibilityEnum = pgEnum('visibility', ['private', 'public'])

/**
 * Invitation status enum for organization invitations
 */
export const orgInvitationStatusEnum = pgEnum('org_invitation_status', ['pending', 'accepted', 'rejected', 'expired'])

export const catalogItems = pgTable('catalog_items', {
  id: text('id').primaryKey(),
  type: itemTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  authorId: text('author_id').references(() => users.id), // FK to users table
  tags: text('tags').array().default([]),

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

  // MCP integration field
  mcpEnabled: boolean('mcp_enabled').default(false),

  // Version management
  version: text('version').default('1.0.0'),
  status: text('status').default('published'), // 'draft' | 'published'
  changelog: text('changelog'), // Latest version changelog

  // Vector embedding for semantic search (1536 dimensions for OpenAI text-embedding-3-small)
  embedding: halfvec('embedding', { dimensions: 1536 }),

  // Multi-tenancy & collaboration fields
  /** Organization owner (nullable for migration compatibility) */
  orgId: text('org_id').references(() => organizations.id),
  /** Visibility level (private or public) */
  visibility: visibilityEnum('visibility').default('private'),
  /** Self-reference to original item if this is a fork (stored as text to avoid circular type dependency) */
  forkedFrom: text('forked_from'),
  /** Count of times this item has been forked */
  forkCount: integer('fork_count').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('catalog_items_type_idx').on(table.type),
  index('catalog_items_status_idx').on(table.status),
  index('catalog_items_author_id_idx').on(table.authorId),
  index('catalog_items_mcp_enabled_idx').on(table.mcpEnabled),
  index('catalog_items_type_status_idx').on(table.type, table.status),
  index('catalog_items_org_id_idx').on(table.orgId),
  index('catalog_items_visibility_idx').on(table.visibility),
  index('catalog_items_forked_from_idx').on(table.forkedFrom),
])

export type CatalogItemRecord = typeof catalogItems.$inferSelect
export type NewCatalogItemRecord = typeof catalogItems.$inferInsert

// ============================================
// Catalog Item Translations Table (i18n)
// ============================================

/**
 * Translations for catalog items
 *
 * Stores locale-specific translations for catalog item text fields.
 * Falls back to the original catalog_items data when no translation exists.
 */
export const catalogItemTranslations = pgTable('catalog_item_translations', {
  /** Reference to the catalog item */
  itemId: text('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  /** Locale code (e.g., 'ko', 'en') */
  locale: text('locale').notNull(),
  /** Translated item name */
  name: text('name'),
  /** Translated description */
  description: text('description'),
  /** Translated content (main body) */
  content: text('content'),
  /** Translated README */
  readme: text('readme'),
  /** Whether this translation was auto-generated */
  isAutoTranslated: boolean('is_auto_translated').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.itemId, table.locale] }),
  index('catalog_item_translations_locale_idx').on(table.locale),
])

export type CatalogItemTranslationRecord = typeof catalogItemTranslations.$inferSelect
export type NewCatalogItemTranslationRecord = typeof catalogItemTranslations.$inferInsert

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
// Organizations & Memberships
// ============================================

/**
 * Organizations table for multi-tenancy
 */
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Organization name */
  name: text('name').notNull(),
  /** URL-safe slug for organization */
  slug: text('slug').notNull().unique(),
  /** Email domains allowed to auto-join (e.g., ["gpters.org"]) */
  allowedDomains: jsonb('allowed_domains').$type<string[]>().notNull().default([]),
  /** Organization description */
  description: text('description'),
  /** Whether organization is active */
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type OrganizationRecord = typeof organizations.$inferSelect
export type NewOrganizationRecord = typeof organizations.$inferInsert

/**
 * Organization memberships junction table (users ↔ organizations)
 */
export const orgMemberships = pgTable('org_memberships', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  /** Member role within organization */
  role: orgRoleEnum('role').notNull().default('org_viewer'),
  /** When user joined organization */
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  /** User who invited this member */
  invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.orgId] }),
  index('org_memberships_user_id_idx').on(table.userId),
  index('org_memberships_org_id_idx').on(table.orgId),
])

export type OrgMembershipRecord = typeof orgMemberships.$inferSelect
export type NewOrgMembershipRecord = typeof orgMemberships.$inferInsert

/**
 * Organization invitations table
 */
export const orgInvitations = pgTable('org_invitations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Organization to join */
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  /** Invitee email address */
  email: text('email').notNull(),
  /** Role to assign upon acceptance */
  role: orgRoleEnum('role').notNull().default('org_viewer'),
  /** Invitation status */
  status: orgInvitationStatusEnum('status').notNull().default('pending'),
  /** User who sent invitation */
  invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
  /** Invitation expiration timestamp */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('org_invitations_email_org_status_idx').on(table.email, table.orgId, table.status),
  index('org_invitations_org_id_idx').on(table.orgId),
])

export type OrgInvitationRecord = typeof orgInvitations.$inferSelect
export type NewOrgInvitationRecord = typeof orgInvitations.$inferInsert

// ============================================
// Normalized Tables
// ============================================

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

// Junction table for packages <-> items (many-to-many)
// A package can contain multiple items, and an item can belong to multiple packages
export const packageItems = pgTable('package_items', {
  packageId: text('package_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  displayOrder: integer('display_order').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.packageId, table.itemId] }),
  index('package_items_package_id_idx').on(table.packageId),
  index('package_items_item_id_idx').on(table.itemId),
])

export type PackageItemRecord = typeof packageItems.$inferSelect
export type NewPackageItemRecord = typeof packageItems.$inferInsert

// ============================================
// Relations
// ============================================

export const catalogItemsRelations = relations(catalogItems, ({ one, many }) => ({
  itemTags: many(catalogItemTags),
  translations: many(catalogItemTranslations),
  // Package relations
  packageContents: many(packageItems, { relationName: 'packageContents' }), // Items contained in this package
  containedInPackages: many(packageItems, { relationName: 'containedInPackages' }), // Packages containing this item
  // Organization relation
  organization: one(organizations, {
    fields: [catalogItems.orgId],
    references: [organizations.id],
  }),
}))

export const catalogItemTranslationsRelations = relations(catalogItemTranslations, ({ one }) => ({
  item: one(catalogItems, {
    fields: [catalogItemTranslations.itemId],
    references: [catalogItems.id],
  }),
}))

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(orgMemberships),
  invitations: many(orgInvitations),
  catalogItems: many(catalogItems),
}))

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMemberships.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMemberships.userId],
    references: [users.id],
  }),
  inviter: one(users, {
    fields: [orgMemberships.invitedBy],
    references: [users.id],
  }),
}))

export const orgInvitationsRelations = relations(orgInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgInvitations.orgId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [orgInvitations.invitedBy],
    references: [users.id],
  }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(orgMemberships),
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

export const packageItemsRelations = relations(packageItems, ({ one }) => ({
  package: one(catalogItems, {
    fields: [packageItems.packageId],
    references: [catalogItems.id],
    relationName: 'packageContents',
  }),
  item: one(catalogItems, {
    fields: [packageItems.itemId],
    references: [catalogItems.id],
    relationName: 'containedInPackages',
  }),
}))

// ============================================
// OAuth 2.1 Tables (for MCP native auth)
// ============================================

// OAuth Clients - Dynamic Client Registration (RFC 7591)
export const oauthClients = pgTable('oauth_clients', {
  id: text('id').primaryKey(), // client_id (UUID)
  secretHash: text('secret_hash'), // SHA-256 hash of client_secret (null for public clients)
  name: text('name').notNull(),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type OAuthClientRecord = typeof oauthClients.$inferSelect
export type NewOAuthClientRecord = typeof oauthClients.$inferInsert

// OAuth Authorization Codes - PKCE required
export const oauthCodes = pgTable('oauth_codes', {
  code: text('code').primaryKey(), // Authorization code (UUID)
  clientId: text('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeChallenge: text('code_challenge').notNull(), // PKCE code_challenge
  codeChallengeMethod: text('code_challenge_method').notNull().default('S256'), // S256 only
  redirectUri: text('redirect_uri').notNull(),
  scope: text('scope'), // Optional scopes
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('oauth_codes_client_id_idx').on(table.clientId),
  index('oauth_codes_user_id_idx').on(table.userId),
  index('oauth_codes_expires_at_idx').on(table.expiresAt),
])

export type OAuthCodeRecord = typeof oauthCodes.$inferSelect
export type NewOAuthCodeRecord = typeof oauthCodes.$inferInsert

// OAuth Access Tokens - Issued after successful OAuth flow
export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 hash of token
  clientId: text('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text('scope'), // Optional scopes
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  usageCount: integer('usage_count').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('oauth_access_tokens_token_hash_idx').on(table.tokenHash),
  index('oauth_access_tokens_user_id_idx').on(table.userId),
  index('oauth_access_tokens_client_id_idx').on(table.clientId),
])

export type OAuthAccessTokenRecord = typeof oauthAccessTokens.$inferSelect
export type NewOAuthAccessTokenRecord = typeof oauthAccessTokens.$inferInsert

// OAuth Refresh Tokens - Issued alongside access tokens for token rotation
export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 hash of refresh token
  clientId: text('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessTokenId: text('access_token_id').references(() => oauthAccessTokens.id, { onDelete: 'set null' }),
  scope: text('scope'),
  /** Token chain identifier — all tokens from the same auth code share a familyId */
  familyId: text('family_id').notNull(),
  /** Rotation counter within the family (starts at 0) */
  generation: integer('generation').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokeReason: text('revoke_reason'), // 'rotated' | 'user_logout' | 'replay_detected' | 'manual'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('oauth_refresh_tokens_token_hash_idx').on(table.tokenHash),
  index('oauth_refresh_tokens_user_id_idx').on(table.userId),
  index('oauth_refresh_tokens_client_id_idx').on(table.clientId),
  index('oauth_refresh_tokens_family_id_idx').on(table.familyId),
  index('oauth_refresh_tokens_expires_at_idx').on(table.expiresAt),
])

export type OAuthRefreshTokenRecord = typeof oauthRefreshTokens.$inferSelect
export type NewOAuthRefreshTokenRecord = typeof oauthRefreshTokens.$inferInsert

// Relations for OAuth tables
export const oauthClientsRelations = relations(oauthClients, ({ many }) => ({
  codes: many(oauthCodes),
  accessTokens: many(oauthAccessTokens),
  refreshTokens: many(oauthRefreshTokens),
}))

export const oauthCodesRelations = relations(oauthCodes, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthCodes.clientId],
    references: [oauthClients.id],
  }),
  user: one(users, {
    fields: [oauthCodes.userId],
    references: [users.id],
  }),
}))

export const oauthAccessTokensRelations = relations(oauthAccessTokens, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthAccessTokens.clientId],
    references: [oauthClients.id],
  }),
  user: one(users, {
    fields: [oauthAccessTokens.userId],
    references: [users.id],
  }),
}))

export const oauthRefreshTokensRelations = relations(oauthRefreshTokens, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthRefreshTokens.clientId],
    references: [oauthClients.id],
  }),
  user: one(users, {
    fields: [oauthRefreshTokens.userId],
    references: [users.id],
  }),
  accessToken: one(oauthAccessTokens, {
    fields: [oauthRefreshTokens.accessTokenId],
    references: [oauthAccessTokens.id],
  }),
}))

// ============================================
// Item Version History Table
// ============================================

export const versionTypeEnum = pgEnum('version_type', ['major', 'minor', 'patch'])

// Suggestion status for collaboration workflow
export const suggestionStatusEnum = pgEnum('suggestion_status', ['pending', 'accepted', 'rejected'])

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
// MCP Audit Logs Table
// ============================================

export const mcpAuditLogs = pgTable('mcp_audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Request info
  method: text('method').notNull(), // JSON-RPC method or REST action (e.g., 'tools/call', 'search')
  tool: text('tool'), // Tool name if applicable (e.g., 'search_plugins', 'get_plugin_content')

  // Authentication (OAuth access token)
  accessTokenId: text('access_token_id').references(() => oauthAccessTokens.id, { onDelete: 'set null' }),
  isAuthenticated: boolean('is_authenticated').notNull().default(false),

  // Client info (masked for privacy)
  ipHash: text('ip_hash').notNull(), // SHA-256 hash of IP for privacy
  userAgent: text('user_agent'),
  clientType: text('client_type'),       // Resolved type: claude_code, opencode, cursor, web_browser, cli, unknown
  clientName: text('client_name'),       // Raw name from MCP initialize clientInfo
  clientVersion: text('client_version'), // Raw version from MCP initialize clientInfo

  // Request/Response
  requestParams: jsonb('request_params').$type<Record<string, unknown>>(), // Sanitized request params
  responseStatus: text('response_status').notNull(), // 'success' | 'error' | 'rate_limited'
  responseTime: integer('response_time'), // Response time in milliseconds
  errorCode: text('error_code'), // Error code if failed
  errorMessage: text('error_message'), // Error message if failed

  // Discovery analytics fields
  /** MCP session ID for linking search → view → install flow */
  sessionId: text('session_id'),
  /** Search result list snapshot [{itemId, rank, score}] */
  searchResults: jsonb('search_results').$type<Array<{ itemId: string; rank: number; score: number }>>(),
  /** How user arrived: 'search' | 'suggest' | 'direct' | 'browse' */
  referralSource: text('referral_source'),

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('mcp_audit_logs_created_at_idx').on(table.createdAt),
  index('mcp_audit_logs_access_token_id_idx').on(table.accessTokenId),
  index('mcp_audit_logs_method_idx').on(table.method),
  index('mcp_audit_logs_response_status_idx').on(table.responseStatus),
  // Composite index for common queries
  index('mcp_audit_logs_created_status_idx').on(table.createdAt, table.responseStatus),
  index('mcp_audit_logs_client_type_idx').on(table.clientType),
  index('mcp_audit_logs_session_id_idx').on(table.sessionId),
])

export type McpAuditLogRecord = typeof mcpAuditLogs.$inferSelect
export type NewMcpAuditLogRecord = typeof mcpAuditLogs.$inferInsert

// Relations for MCP audit logs
export const mcpAuditLogsRelations = relations(mcpAuditLogs, ({ one }) => ({
  accessToken: one(oauthAccessTokens, {
    fields: [mcpAuditLogs.accessTokenId],
    references: [oauthAccessTokens.id],
  }),
}))

// ============================================
// MCP Sessions Table (Session Conversation Tracking)
// ============================================

/** Session lifecycle status */
export const sessionStatusEnum = pgEnum('session_status', ['active', 'finalized'])

/**
 * MCP session tracking for conversation-level analytics
 *
 * Aggregates per-session activity from individual audit log entries.
 * Enables user journey analysis: search → view → deploy funnel.
 */
export const mcpSessions = pgTable('mcp_sessions', {
  sessionId: text('session_id').primaryKey(),

  // User identification
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  accessTokenId: text('access_token_id').references(() => oauthAccessTokens.id, { onDelete: 'set null' }),

  // Client metadata
  clientType: text('client_type'),
  clientName: text('client_name'),
  clientVersion: text('client_version'),
  ipHash: text('ip_hash'),

  // Timing
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull(),
  /** Computed on finalization: lastActivityAt - startedAt in seconds */
  durationSeconds: integer('duration_seconds'),

  // Activity counters
  totalRequests: integer('total_requests').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),

  /** Per-tool call counts e.g. { "semantic_search": 5, "get_plugin_content": 3 } */
  toolCounts: jsonb('tool_counts').$type<Record<string, number>>().notNull().default({}),

  /** Chronological action log (capped at 100 entries) */
  actionLog: jsonb('action_log').$type<Array<{
    action: 'search' | 'view' | 'deploy' | 'suggest' | 'other'
    skillId?: string
    query?: string
    timestamp: string
  }>>().notNull().default([]),

  /** Per-skill interaction counters e.g. { "code-reviewer": { searched: 1, viewed: 2, deployed: 0 } } */
  skillInteractions: jsonb('skill_interactions').$type<Record<string, {
    searched: number; viewed: number; deployed: number
  }>>().notNull().default({}),

  /** Client-reported context merged from report_session_event tool */
  clientContext: jsonb('client_context').$type<{
    promptCount?: number
    suggestionsShown?: number
    suggestionsUsed?: number
    skippedSearches?: number
    sessionEndReason?: string
    pluginVersion?: string
  }>(),

  // Boolean activity flags
  hadSearch: boolean('had_search').notNull().default(false),
  hadView: boolean('had_view').notNull().default(false),
  hadDeployment: boolean('had_deployment').notNull().default(false),

  // Conversion metrics (computed on finalization)
  searchToViewConversion: boolean('search_to_view_conversion'),
  viewToDeployConversion: boolean('view_to_deploy_conversion'),
  avgResponseTime: integer('avg_response_time'),

  // Lifecycle
  status: sessionStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('mcp_sessions_user_id_idx').on(table.userId),
  index('mcp_sessions_started_at_idx').on(table.startedAt),
  index('mcp_sessions_last_activity_idx').on(table.lastActivityAt),
  index('mcp_sessions_status_idx').on(table.status),
  index('mcp_sessions_client_type_idx').on(table.clientType),
  index('mcp_sessions_had_deployment_idx').on(table.hadDeployment),
])

export type McpSessionRecord = typeof mcpSessions.$inferSelect
export type NewMcpSessionRecord = typeof mcpSessions.$inferInsert

/** Relations for MCP sessions */
export const mcpSessionsRelations = relations(mcpSessions, ({ one }) => ({
  user: one(users, {
    fields: [mcpSessions.userId],
    references: [users.id],
  }),
  accessToken: one(oauthAccessTokens, {
    fields: [mcpSessions.accessTokenId],
    references: [oauthAccessTokens.id],
  }),
}))

// ============================================
// Suggestions Table (Collaboration)
// ============================================

export const suggestions = pgTable('suggestions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pluginId: text('plugin_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
  
  title: text('title').notNull(),
  description: text('description').notNull(),
  diff: text('diff'),
  
  status: suggestionStatusEnum('status').notNull().default('pending'),
  
  suggestedBy: text('suggested_by').references(() => users.id, { onDelete: 'set null' }),
  suggestedByName: text('suggested_by_name'),
  
  resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolveComment: text('resolve_comment'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('suggestions_plugin_id_idx').on(table.pluginId),
  index('suggestions_status_idx').on(table.status),
  index('suggestions_suggested_by_idx').on(table.suggestedBy),
  index('suggestions_created_at_idx').on(table.createdAt),
])

export type SuggestionRecord = typeof suggestions.$inferSelect
export type NewSuggestionRecord = typeof suggestions.$inferInsert

// ============================================
// Skill Events Table (Normalized Skill Usage Tracking)
// ============================================

/** Skill interaction action types */
export const skillEventActionEnum = pgEnum('skill_event_action', [
  'search',   // semantic_search에서 결과로 노출
  'load',     // get_plugin_content로 상세 로드
  'apply',    // report_skill_outcome(applied=true)
  'skip',     // report_search_skip 또는 report_skill_outcome(applied=false)
  'deploy',   // deploy_skill 호출
  'suggest',  // suggest_improvement 호출
])

/**
 * Normalized skill usage events
 *
 * Replaces JSONB fields (skillInteractions, actionLog) with queryable rows.
 * Each row = one skill interaction within a session.
 * Enables: funnel analysis, skill popularity trends, search→load→apply conversion.
 */
export const skillEvents = pgTable('skill_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => mcpSessions.sessionId, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  skillId: text('skill_id').notNull(),

  /** Interaction type */
  action: skillEventActionEnum('action').notNull(),

  /** Why this skill was used/skipped (free text from client or inferred) */
  context: text('context'),

  /** Search query that surfaced this skill (for search action) */
  query: text('query'),

  /** Position in search results (1-based) */
  rank: integer('rank'),

  /** Relevance score from search */
  score: real('score'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('skill_events_session_id_idx').on(table.sessionId),
  index('skill_events_skill_id_idx').on(table.skillId),
  index('skill_events_action_idx').on(table.action),
  index('skill_events_user_id_idx').on(table.userId),
  index('skill_events_created_at_idx').on(table.createdAt),
  index('skill_events_skill_action_idx').on(table.skillId, table.action),
])

export type SkillEventRecord = typeof skillEvents.$inferSelect
export type NewSkillEventRecord = typeof skillEvents.$inferInsert

/** Relations for skill events */
export const skillEventsRelations = relations(skillEvents, ({ one }) => ({
  session: one(mcpSessions, {
    fields: [skillEvents.sessionId],
    references: [mcpSessions.sessionId],
  }),
  user: one(users, {
    fields: [skillEvents.userId],
    references: [users.id],
  }),
}))

export const suggestionsRelations = relations(suggestions, ({ one }) => ({
  plugin: one(catalogItems, {
    fields: [suggestions.pluginId],
    references: [catalogItems.id],
  }),
  suggestedByUser: one(users, {
    fields: [suggestions.suggestedBy],
    references: [users.id],
    relationName: 'suggestedBy',
  }),
  resolvedByUser: one(users, {
    fields: [suggestions.resolvedBy],
    references: [users.id],
    relationName: 'resolvedBy',
  }),
}))
