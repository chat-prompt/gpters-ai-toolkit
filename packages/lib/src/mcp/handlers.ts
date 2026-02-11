/**
 * MCP Handler Functions for GPTers Marketplace
 *
 * Database query handlers for each MCP tool.
 */

import { createLogger } from '../core/logger'
import { db, catalogItems, users, suggestions } from '@gpters/db'
import { resolveAgentsAsConfig } from '../plugin/dependency-resolver'
import { isSuperAdmin } from '../security/rbac'

const log = createLogger('mcp-handler')
import { ilike, or, eq, and, sql, inArray, desc } from 'drizzle-orm'
import type {
  SearchPluginsInput,
  GetPluginContentInput,
  ListPluginsInput,
  GetPluginsByCategoryInput,
  GetPromptInput,
  CreatePluginInput,
  UpdatePluginInput,
  DeletePluginInput,
  DeploySkillInput,
  DeploySkillResponse,
  CheckUpdatesInput,
  CheckUpdatesResponse,
  PluginSummary,
  PluginContent,
  SearchResult,
  ListResult,
  McpToolResponse,
  McpPrompt,
  McpPromptResult,
  SuggestImprovementInput,
  SuggestImprovementResponse,
  ListSuggestionsInput,
  ListSuggestionsResponse,
  SuggestionSummary,
  ResolveSuggestionInput,
  ResolveSuggestionResponse,
  UndeploySkillInput,
  UndeploySkillResponse,
  SemanticSearchInput,
  SemanticSearchResult,
} from './types'
import type { ItemType, TeamTag, CatalogItem } from '../core/types'
import { determineVersion, generateIdFromName, hasUpdate } from '../versioning/version'
import { createVersionSnapshot } from '../versioning/skill-version'
import { getBaseUrl } from '../utils'
import { generateEmbedding, prepareTextForEmbedding } from '../search/embedding'
import { semanticSearch as semanticSearchImpl } from '../search/vector-search'

async function updateItemEmbedding(id: string, item: { name: string; description: string; content?: string | null; tags?: string[] | null; readme?: string | null }): Promise<void> {
  try {
    const text = prepareTextForEmbedding(item)
    if (!text) return

    const embedding = await generateEmbedding(text)
    await db.update(catalogItems).set({ embedding }).where(eq(catalogItems.id, id))
  } catch (error) {
    log.error(`Failed to generate embedding for ${id}`, error)
  }
}

type PluginFileWithType = { name: string; content: string; type?: string }

function normalizeFileType(type: string): string {
  const scriptTypes = ['javascript', 'typescript', 'bash', 'shell', 'python', 'ruby']
  if (scriptTypes.includes(type.toLowerCase())) return 'script'
  return type
}

function inferFileType(file: PluginFileWithType): string {
  if (file.type) return normalizeFileType(file.type)
  
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const name = file.name.toLowerCase()
  
  if (['js', 'mjs', 'ts', 'sh', 'bash', 'py', 'rb'].includes(ext)) return 'script'
  if (name.includes('template') || name.includes('example')) return 'template'
  if (['json', 'yaml', 'yml', 'toml', 'ini', 'env'].includes(ext)) return 'config'
  if (name.startsWith('references/') || name.includes('guide') || name.includes('rule')) return 'reference'
  if (['md', 'txt', 'rst'].includes(ext)) return 'reference'
  
  return 'reference'
}

function generateFilesUsageHint(files: PluginFileWithType[]): string {
  const grouped: Record<string, PluginFileWithType[]> = {
    script: [],
    template: [],
    config: [],
    reference: [],
  }
  
  for (const file of files) {
    const type = inferFileType(file)
    if (grouped[type]) {
      grouped[type].push(file)
    } else {
      grouped.reference.push(file)
    }
  }
  
  const hints: string[] = [`이 스킬에는 ${files.length}개의 파일이 포함되어 있습니다.\n`]
  
  if (grouped.script.length > 0) {
    hints.push(`🔧 **실행 스크립트** (node/bash로 실행)`)
    for (const f of grouped.script) {
      hints.push(`- \`${f.name}\``)
    }
    hints.push('')
  }
  
  if (grouped.template.length > 0) {
    hints.push(`📋 **템플릿** (프로젝트에 복사)`)
    for (const f of grouped.template) {
      hints.push(`- \`${f.name}\``)
    }
    hints.push('')
  }
  
  if (grouped.config.length > 0) {
    hints.push(`⚙️ **설정 파일** (프로젝트 설정에 추가)`)
    for (const f of grouped.config) {
      hints.push(`- \`${f.name}\``)
    }
    hints.push('')
  }
  
  if (grouped.reference.length > 0) {
    hints.push(`📚 **참조 문서** (컨텍스트로 활용)`)
    for (const f of grouped.reference) {
      hints.push(`- \`${f.name}\``)
    }
    hints.push('')
  }
  
  return hints.join('\n').trim()
}

/**
 * Search plugins by keyword with organization-based filtering
 * Searches across name, description, and tags
 * Respects org visibility: private (own org), shared (allowed orgs), public (all), legacy (orgId=null)
 * 
 * @param input - Search parameters
 * @param userId - Authenticated user ID (optional)
 * @param userRole - User's role (optional)
 * @param orgId - User's current organization ID (optional)
 */
export async function searchPlugins(
  input: SearchPluginsInput,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<SearchResult> {
  const { query, category, teamTag, limit = 5 } = input
  const safeLimit = Math.min(Math.max(1, limit), 20)

  const searchPattern = `%${query}%`

  // Build search condition - search across name, description, tags, and readme
  const searchCondition = or(
    ilike(catalogItems.name, searchPattern),
    ilike(catalogItems.description, searchPattern),
    ilike(catalogItems.readme, searchPattern),
    sql`array_to_string(${catalogItems.tags}, ',') ILIKE ${searchPattern}`
  )

  // Build filter conditions
  const conditions = [searchCondition]

  if (category && category !== 'all') {
    conditions.push(eq(catalogItems.type, category as ItemType))
  }

  if (teamTag) {
    conditions.push(eq(catalogItems.teamTag, teamTag as TeamTag))
  }

  // Only include marketplace-enabled items
  conditions.push(eq(catalogItems.mcpEnabled, true))

  // Add org-based visibility filtering
  if (userId && orgId && !isSuperAdmin(userRole as any)) {
    // Regular users see: own org items + public items + shared items + legacy (orgId=null)
    const visibilityCondition = or(
      eq(catalogItems.orgId, orgId), // Own org items
      eq(catalogItems.visibility, 'public'), // Public items
      and(
        eq(catalogItems.visibility, 'shared'),
        sql`${catalogItems.sharedWithOrgs}::jsonb @> ${JSON.stringify([orgId])}::jsonb` // Shared with user's org
      ),
      sql`${catalogItems.orgId} IS NULL` // Legacy items (backward compat)
    )
    conditions.push(visibilityCondition)
  } else if (!userId) {
    // Unauthenticated users see only public items + legacy
    conditions.push(
      or(
        eq(catalogItems.visibility, 'public'),
        sql`${catalogItems.orgId} IS NULL`
      )
    )
  }
  // super_admin sees all (no additional filter)

  const whereClause = and(...conditions)

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(whereClause)
    .limit(safeLimit)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    authorName: item.authorName || 'Unknown',
    tags: item.tags || [],
    teamTag: item.teamTag || undefined,
    difficulty: item.difficulty || undefined,
  }))

  return {
    plugins,
    total: plugins.length,
    query,
  }
}

/**
 * Get full content of a specific plugin with organization-based access control
 * Returns null if plugin not found or user doesn't have access
 * 
 * @param input - Plugin content request
 * @param userId - Authenticated user ID (optional)
 * @param userRole - User's role (optional)
 * @param orgId - User's current organization ID (optional)
 */
export async function getPluginContent(
  input: GetPluginContentInput,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<PluginContent | null> {
  const { pluginId } = input

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
      content: catalogItems.content,
      readme: catalogItems.readme,
      files: catalogItems.files,
      dependencies: catalogItems.dependencies,
      allowedTools: catalogItems.allowedTools,
      agentModel: catalogItems.agentModel,
      agentPermissionMode: catalogItems.agentPermissionMode,
      agentSkills: catalogItems.agentSkills,
      commandArgumentHint: catalogItems.commandArgumentHint,
      commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
      version: catalogItems.version,
      status: catalogItems.status,
      changelog: catalogItems.changelog,
      orgId: catalogItems.orgId,
      visibility: catalogItems.visibility,
      sharedWithOrgs: catalogItems.sharedWithOrgs,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(eq(catalogItems.id, pluginId))
    .limit(1)

  if (results.length === 0) {
    return null
  }

  const item = results[0]

  // Check org-based access control
  if (!isSuperAdmin(userRole as any)) {
    // Legacy items (orgId=null) are accessible to all
    if (item.orgId !== null) {
      // Public items are accessible to all
      if (item.visibility !== 'public') {
        // Private items require matching orgId
        if (item.visibility === 'private') {
          if (!orgId || item.orgId !== orgId) {
            return null
          }
        }
        // Shared items require user's org to be in sharedWithOrgs
        if (item.visibility === 'shared') {
          if (!orgId) {
            return null
          }
          const sharedOrgs = (item.sharedWithOrgs as string[]) || []
          if (!sharedOrgs.includes(orgId)) {
            return null
          }
        }
      }
    }
  }

  // Resolve agent dependencies if this is a skill with agent dependencies
  let resolvedAgents: Awaited<ReturnType<typeof resolveAgentsAsConfig>> | undefined
  if (item.type === 'skill' && item.dependencies && item.dependencies.length > 0) {
    const hasAgentDeps = item.dependencies.some((dep) => dep.startsWith('agent:'))
    if (hasAgentDeps) {
      resolvedAgents = await resolveAgentsAsConfig(pluginId)
    }
  }

  return {
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    authorName: item.authorName || 'Unknown',
    tags: item.tags || [],
    teamTag: item.teamTag || undefined,
    difficulty: item.difficulty || undefined,
    content: item.content,
    readme: item.readme || undefined,
    files: item.files || undefined,
    dependencies: item.dependencies || undefined,
    allowedTools: item.allowedTools || undefined,
    agentModel: item.agentModel || undefined,
    agentPermissionMode: item.agentPermissionMode || undefined,
    agentSkills: item.agentSkills || undefined,
    commandArgumentHint: item.commandArgumentHint || undefined,
    commandDisableModelInvocation: item.commandDisableModelInvocation || undefined,
    // V2: Version info
    version: item.version || '1.0.0',
    status: item.status || 'published',
    changelog: item.changelog || undefined,
    // Resolved agent dependencies
    resolvedAgents: resolvedAgents && resolvedAgents.length > 0 ? resolvedAgents : undefined,
    agentUsageHint: resolvedAgents && resolvedAgents.length > 0
      ? `이 스킬에는 ${resolvedAgents.length}개의 서브에이전트가 포함되어 있습니다.\n` +
        `서브에이전트 실행: Task(OpenCode: delegate_task)로 prompt를 전달하세요.\n\n` +
        resolvedAgents.map(a => 
          `## ${a.id} (model: ${a.model})\n` +
          `${a.description}\n\n` +
          `**Prompt:**\n\`\`\`\n${a.prompt}\n\`\`\``
        ).join('\n\n---\n\n')
      : undefined,
    filesUsageHint: item.files && item.files.length > 0
      ? generateFilesUsageHint(item.files)
      : undefined,
  }
}

/**
 * List all plugins with optional filters and organization-based visibility
 * 
 * @param input - List parameters
 * @param userId - Authenticated user ID (optional)
 * @param userRole - User's role (optional)
 * @param orgId - User's current organization ID (optional)
 */
export async function listPlugins(
  input: ListPluginsInput = {},
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<ListResult> {
  const { category, teamTag } = input

  const conditions = []

  if (category && category !== 'all') {
    conditions.push(eq(catalogItems.type, category as ItemType))
  }

  if (teamTag) {
    conditions.push(eq(catalogItems.teamTag, teamTag as TeamTag))
  }

  // Only include marketplace-enabled items
  conditions.push(eq(catalogItems.mcpEnabled, true))

  // Add org-based visibility filtering
  if (userId && orgId && !isSuperAdmin(userRole as any)) {
    // Regular users see: own org items + public items + shared items + legacy (orgId=null)
    const visibilityCondition = or(
      eq(catalogItems.orgId, orgId),
      eq(catalogItems.visibility, 'public'),
      and(
        eq(catalogItems.visibility, 'shared'),
        sql`${catalogItems.sharedWithOrgs}::jsonb @> ${JSON.stringify([orgId])}::jsonb`
      ),
      sql`${catalogItems.orgId} IS NULL`
    )
    conditions.push(visibilityCondition)
  } else if (!userId) {
    // Unauthenticated users see only public items + legacy
    conditions.push(
      or(
        eq(catalogItems.visibility, 'public'),
        sql`${catalogItems.orgId} IS NULL`
      )
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(whereClause)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    authorName: item.authorName || 'Unknown',
    tags: item.tags || [],
    teamTag: item.teamTag || undefined,
    difficulty: item.difficulty || undefined,
  }))

  return {
    plugins,
    total: plugins.length,
  }
}

/**
 * Get plugins by category
 */
export async function getPluginsByCategory(input: GetPluginsByCategoryInput): Promise<ListResult> {
  const { category, limit = 10 } = input
  const safeLimit = Math.min(Math.max(1, limit), 50)

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(
      and(
        eq(catalogItems.type, category),
        eq(catalogItems.mcpEnabled, true)
      )
    )
    .limit(safeLimit)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    authorName: item.authorName || 'Unknown',
    tags: item.tags || [],
    teamTag: item.teamTag || undefined,
    difficulty: item.difficulty || undefined,
  }))

  return {
    plugins,
    total: plugins.length,
  }
}

/**
 * Create a new plugin
 * Requires admin authentication (handled by API route)
 */
export async function createPlugin(
  input: CreatePluginInput
): Promise<{ success: boolean; id: string; error?: string }> {
  const { id, type, name, description, content, tags, teamTag, readme, files, mcpEnabled } = input

  // Check if plugin already exists
  const existing = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length > 0) {
    return { success: false, id, error: `Plugin with ID '${id}' already exists` }
  }

  // Note: authorId should be set by the API route based on authenticated user
  await db.insert(catalogItems).values({
    id,
    type,
    name,
    description: description || '',
    content,
    tags: tags || [],
    teamTag: (teamTag as TeamTag) || 'general',
    readme: readme || null,
    files: files || null,
    mcpEnabled: mcpEnabled || false,
    likes: 0,
    dependencies: [],
  })

  updateItemEmbedding(id, { name, description: description || '', content, tags, readme }).catch(() => {})

  return { success: true, id }
}

/**
 * Update an existing plugin
 * Requires admin authentication (handled by API route)
 */
export async function updatePlugin(
  input: UpdatePluginInput
): Promise<{ success: boolean; id: string; error?: string }> {
  const { id, ...updateFields } = input

  // Check if plugin exists
  const existing = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length === 0) {
    return { success: false, id, error: `Plugin with ID '${id}' not found` }
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (updateFields.name !== undefined) updateData.name = updateFields.name
  if (updateFields.description !== undefined) updateData.description = updateFields.description
  if (updateFields.content !== undefined) updateData.content = updateFields.content
  // Note: authorId is not updated through this API
  if (updateFields.tags !== undefined) updateData.tags = updateFields.tags
  if (updateFields.teamTag !== undefined) updateData.teamTag = updateFields.teamTag
  if (updateFields.readme !== undefined) updateData.readme = updateFields.readme
  if (updateFields.files !== undefined) updateData.files = updateFields.files
  if (updateFields.mcpEnabled !== undefined) updateData.mcpEnabled = updateFields.mcpEnabled

  await db.update(catalogItems).set(updateData).where(eq(catalogItems.id, id))

  const shouldUpdateEmbedding = updateFields.name !== undefined || 
    updateFields.description !== undefined || 
    updateFields.content !== undefined || 
    updateFields.tags !== undefined ||
    updateFields.readme !== undefined

  if (shouldUpdateEmbedding) {
    const [current] = await db.select({
      name: catalogItems.name,
      description: catalogItems.description,
      content: catalogItems.content,
      tags: catalogItems.tags,
      readme: catalogItems.readme,
    }).from(catalogItems).where(eq(catalogItems.id, id)).limit(1)

    if (current) {
      updateItemEmbedding(id, current).catch(() => {})
    }
  }

  return { success: true, id }
}

/**
 * Delete a plugin
 * Requires admin authentication (handled by API route)
 */
export async function deletePlugin(
  input: DeletePluginInput
): Promise<{ success: boolean; id: string; error?: string }> {
  const { id } = input

  // Check if plugin exists
  const existing = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length === 0) {
    return { success: false, id, error: `Plugin with ID '${id}' not found` }
  }

  await db.delete(catalogItems).where(eq(catalogItems.id, id))

  return { success: true, id }
}

/**
 * Deploy a skill/agent/command to the marketplace
 * Handles both new deployments and updates with automatic versioning
 *
 * @param input - Deploy skill input
 * @param authorId - Authenticated user ID (for setting ownership)
 * @param userRole - Authenticated user's role (admin can override ownership check)
 * @param orgId - User's current organization ID (for setting org ownership)
 */
export async function deploySkill(
  input: DeploySkillInput,
  authorId?: string,
  userRole?: string,
  orgId?: string
): Promise<DeploySkillResponse> {
  const {
    type,
    name,
    content,
    id: providedId,
    description,
    tags,
    teamTag,
    allowedTools,
    agentModel,
    agentPermissionMode,
    agentSkills,
    status = 'published',
    changelog: explicitChangelog,
    files,
    dependencies,
  } = input

  // Generate ID from name if not provided
  const id = providedId || generateIdFromName(name)

  // Check if this is an update or new deployment
  const existing = await db
    .select({
      id: catalogItems.id,
      content: catalogItems.content,
      version: catalogItems.version,
      authorId: catalogItems.authorId,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  const isUpdate = existing.length > 0
  const existingItem = isUpdate ? existing[0] : null

  // Check ownership for updates - only author or admin can update
  if (isUpdate && existingItem) {
    if (!authorId) {
      return {
        success: false,
        id,
        version: existingItem.version || '1.0.0',
        changelog: '',
        status: 'published',
        webUrl: '',
        installHint: '',
        error: '인증이 필요합니다. MCP 연결이 올바르게 설정되어 있는지 확인해주세요.',
      }
    }

    const hasAdminRole = userRole === 'admin'
    if (existingItem.authorId !== authorId && !hasAdminRole) {
      return {
        success: false,
        id,
        version: existingItem.version || '1.0.0',
        changelog: '',
        status: 'published',
        webUrl: '',
        installHint: '',
        error: `본인이 배포한 플러그인만 업데이트할 수 있습니다. '${name}'의 소유자가 아닙니다.`,
      }
    }
  }

  // Determine version
  const versionInfo = determineVersion(
    existingItem ? { content: existingItem.content, version: existingItem.version || '1.0.0' } : null,
    content,
    explicitChangelog
  )

  const now = new Date()

  if (isUpdate) {
    // Update existing item
    await db
      .update(catalogItems)
      .set({
        name,
        content,
        description: description || '',
        tags: tags || [],
        teamTag: (teamTag as TeamTag) || 'general',
        allowedTools: allowedTools || null,
        agentModel: agentModel || null,
        agentPermissionMode: agentPermissionMode || null,
        agentSkills: agentSkills || null,
        status,
        version: versionInfo.version,
        changelog: versionInfo.changelog,
        files: files || null,
        dependencies: dependencies || [],
        mcpEnabled: status === 'published',
        updatedAt: now,
      })
      .where(eq(catalogItems.id, id))

    // Create version snapshot for tracking updates
    const [updatedItem] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, id))
      .limit(1)

    if (updatedItem) {
      await createVersionSnapshot(updatedItem, {
        version: versionInfo.version,
        versionType: versionInfo.changelog?.includes('major') ? 'major' : 
                     versionInfo.changelog?.includes('minor') ? 'minor' : 'patch',
        changelog: versionInfo.changelog || undefined,
        createdBy: authorId || undefined,
      }).catch((err) => {
        // Log but don't fail the deploy if version snapshot fails
        log.error('Failed to create version snapshot', err)
      })
    }
  } else {
    // Create new item with authorId and orgId from authenticated user
    await db.insert(catalogItems).values({
      id,
      type,
      name,
      content,
      description: description || '',
      tags: tags || [],
      teamTag: (teamTag as TeamTag) || 'general',
      allowedTools: allowedTools || null,
      agentModel: agentModel || null,
      agentPermissionMode: agentPermissionMode || null,
      agentSkills: agentSkills || null,
      status,
      version: versionInfo.version,
      changelog: versionInfo.changelog,
      files: files || null,
      mcpEnabled: status === 'published',
      likes: 0,
      dependencies: dependencies || [],
      authorId: authorId || null,
      orgId: orgId || null,
      visibility: 'private',
      sharedWithOrgs: [],
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    })
  }

  updateItemEmbedding(id, { name, description: description || '', content, tags }).catch(() => {})

  const BASE_URL = getBaseUrl()

  const response: DeploySkillResponse = {
    success: true,
    id,
    version: versionInfo.version,
    previousVersion: existingItem?.version || undefined,
    changelog: versionInfo.changelog,
    status,
    webUrl: `${BASE_URL}/${type}/${id}`,
    installHint: `팀원들은 "${name} 설치해줘"라고 하면 돼요.`,
  }

  return response
}

/**
 * Check for updates to installed skills
 */
export async function checkUpdates(input: CheckUpdatesInput): Promise<CheckUpdatesResponse> {
  const { installations } = input

  if (!installations || installations.length === 0) {
    return { updates: [], upToDate: 0 }
  }

  // Get current versions from database
  const ids = installations.map((i) => i.id)
  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      version: catalogItems.version,
      changelog: catalogItems.changelog,
    })
    .from(catalogItems)
    .where(inArray(catalogItems.id, ids))

  // Create a map for quick lookup
  const latestVersions = new Map(
    results.map((r) => [r.id, { name: r.name, version: r.version || '1.0.0', changelog: r.changelog }])
  )

  const updates: CheckUpdatesResponse['updates'] = []
  let upToDate = 0

  for (const installation of installations) {
    const latest = latestVersions.get(installation.id)
    if (!latest) {
      // Plugin not found in database, skip
      continue
    }

    if (hasUpdate(installation.version, latest.version)) {
      updates.push({
        id: installation.id,
        name: latest.name,
        installedVersion: installation.version,
        latestVersion: latest.version,
        changelog: latest.changelog || 'No changelog available',
      })
    } else {
      upToDate++
    }
  }

  return { updates, upToDate }
}

/**
 * Suggest an improvement to an existing plugin
 *
 * @param input - Suggestion input
 * @param userId - Authenticated user ID (for tracking who suggested)
 */
export async function suggestImprovement(
  input: SuggestImprovementInput,
  userId?: string
): Promise<SuggestImprovementResponse> {
  const { pluginId, title, description, diff, suggestedByName } = input

  const plugin = await db
    .select({ id: catalogItems.id, name: catalogItems.name })
    .from(catalogItems)
    .where(eq(catalogItems.id, pluginId))
    .limit(1)

  if (plugin.length === 0) {
    return {
      success: false,
      suggestionId: '',
      pluginId,
      pluginName: '',
      message: `플러그인 '${pluginId}'을(를) 찾을 수 없습니다`,
    }
  }

  const suggestionId = crypto.randomUUID()
  const now = new Date()

  await db.insert(suggestions).values({
    id: suggestionId,
    pluginId,
    title,
    description,
    diff: diff || null,
    status: 'pending',
    suggestedBy: userId || null,
    suggestedByName: suggestedByName || null,
    createdAt: now,
    updatedAt: now,
  })

  return {
    success: true,
    suggestionId,
    pluginId,
    pluginName: plugin[0].name,
    message: `'${plugin[0].name}'에 대한 개선 제안이 등록되었습니다. 원작자가 검토 후 수락/거부합니다.`,
  }
}

export async function listSuggestions(input: ListSuggestionsInput = {}): Promise<ListSuggestionsResponse> {
  const { pluginId, status = 'all', limit = 20 } = input
  const safeLimit = Math.min(Math.max(1, limit), 50)

  const conditions = []

  if (pluginId) {
    conditions.push(eq(suggestions.pluginId, pluginId))
  }

  if (status && status !== 'all') {
    conditions.push(eq(suggestions.status, status))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const results = await db
    .select({
      id: suggestions.id,
      pluginId: suggestions.pluginId,
      pluginName: catalogItems.name,
      title: suggestions.title,
      description: suggestions.description,
      status: suggestions.status,
      suggestedByName: suggestions.suggestedByName,
      createdAt: suggestions.createdAt,
      resolvedAt: suggestions.resolvedAt,
      resolveComment: suggestions.resolveComment,
    })
    .from(suggestions)
    .leftJoin(catalogItems, eq(suggestions.pluginId, catalogItems.id))
    .where(whereClause)
    .orderBy(desc(suggestions.createdAt))
    .limit(safeLimit)

  const suggestionList: SuggestionSummary[] = results.map((r) => ({
    id: r.id,
    pluginId: r.pluginId,
    pluginName: r.pluginName || 'Unknown',
    title: r.title,
    description: r.description,
    status: r.status,
    suggestedByName: r.suggestedByName,
    createdAt: r.createdAt?.toISOString() || '',
    resolvedAt: r.resolvedAt?.toISOString() || null,
    resolveComment: r.resolveComment,
  }))

  return {
    suggestions: suggestionList,
    total: suggestionList.length,
  }
}

/**
 * Resolve (accept or reject) a suggestion
 * Only the plugin owner or an admin can resolve suggestions for plugins
 *
 * @param input - Resolve suggestion input
 * @param userId - Authenticated user ID (required for ownership check)
 * @param userRole - Authenticated user's role (admin can override ownership check)
 */
export async function resolveSuggestion(
  input: ResolveSuggestionInput,
  userId?: string,
  userRole?: string
): Promise<ResolveSuggestionResponse> {
  const { suggestionId, action, comment } = input

  const suggestion = await db
    .select({
      id: suggestions.id,
      pluginId: suggestions.pluginId,
      status: suggestions.status,
      diff: suggestions.diff,
    })
    .from(suggestions)
    .where(eq(suggestions.id, suggestionId))
    .limit(1)

  if (suggestion.length === 0) {
    return {
      success: false,
      suggestionId,
      action,
      pluginId: '',
      pluginName: '',
      message: `제안 '${suggestionId}'을(를) 찾을 수 없습니다`,
    }
  }

  if (suggestion[0].status !== 'pending') {
    return {
      success: false,
      suggestionId,
      action,
      pluginId: suggestion[0].pluginId,
      pluginName: '',
      message: `이미 처리된 제안입니다 (상태: ${suggestion[0].status})`,
    }
  }

  const plugin = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      version: catalogItems.version,
      authorId: catalogItems.authorId,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, suggestion[0].pluginId))
    .limit(1)

  if (plugin.length === 0) {
    return {
      success: false,
      suggestionId,
      action,
      pluginId: suggestion[0].pluginId,
      pluginName: '',
      message: '연결된 플러그인을 찾을 수 없습니다',
    }
  }

  // Check ownership - must be authenticated and be the plugin author (or admin)
  if (!userId) {
    return {
      success: false,
      suggestionId,
      action,
      pluginId: plugin[0].id,
      pluginName: plugin[0].name,
      message: '인증이 필요합니다. MCP 연결이 올바르게 설정되어 있는지 확인해주세요.',
    }
  }

  // Admin can resolve any suggestion, others can only resolve for their own plugins
  const hasAdminRole = userRole === 'admin'
  if (plugin[0].authorId !== userId && !hasAdminRole) {
    return {
      success: false,
      suggestionId,
      action,
      pluginId: plugin[0].id,
      pluginName: plugin[0].name,
      message: `본인이 배포한 플러그인의 제안만 처리할 수 있습니다. '${plugin[0].name}'의 소유자가 아닙니다.`,
    }
  }

  const now = new Date()
  const newStatus = action === 'accept' ? 'accepted' : 'rejected'

  await db
    .update(suggestions)
    .set({
      status: newStatus,
      resolvedBy: userId,
      resolvedAt: now,
      resolveComment: comment || null,
      updatedAt: now,
    })
    .where(eq(suggestions.id, suggestionId))

  let newVersion: string | undefined
  let contentApplied = false

  if (action === 'accept') {
    const currentVersion = plugin[0].version || '1.0.0'
    const [major, minor, patch] = currentVersion.split('.').map(Number)
    newVersion = `${major}.${minor}.${patch + 1}`

    // diff가 있으면 content도 함께 업데이트
    const updateData: Record<string, unknown> = {
      version: newVersion,
      changelog: `제안 수락: ${suggestion[0].diff ? '코드 변경 반영' : '개선 사항 반영'}`,
      updatedAt: now,
    }

    if (suggestion[0].diff) {
      updateData.content = suggestion[0].diff
      contentApplied = true
    }

    await db
      .update(catalogItems)
      .set(updateData)
      .where(eq(catalogItems.id, plugin[0].id))
  }

  const actionText = action === 'accept' ? '수락' : '거부'
  const versionText = newVersion ? ` (v${newVersion})` : ''
  const contentText = contentApplied ? ' - 내용이 자동으로 적용되었습니다' : ''

  return {
    success: true,
    suggestionId,
    action,
    pluginId: plugin[0].id,
    pluginName: plugin[0].name,
    newVersion,
    contentApplied,
    message: `'${plugin[0].name}'에 대한 제안이 ${actionText}되었습니다${versionText}${contentText}`,
  }
}

/**
 * Undeploy (delete) a skill that the user owns
 * Only allows deletion if the authenticated user is the author or an admin
 *
 * @param input - Undeploy skill input with plugin ID
 * @param userId - Authenticated user ID (required for ownership check)
 * @param userRole - Authenticated user's role (admin can override ownership check)
 */
export async function undeploySkill(
  input: UndeploySkillInput,
  userId?: string,
  userRole?: string
): Promise<UndeploySkillResponse> {
  const { id } = input

  // Check if plugin exists and get author info
  const existing = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      authorId: catalogItems.authorId,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length === 0) {
    return {
      success: false,
      id,
      message: `플러그인 '${id}'을(를) 찾을 수 없습니다`,
    }
  }

  const plugin = existing[0]

  // Check ownership - must be authenticated and be the author (or admin)
  if (!userId) {
    return {
      success: false,
      id,
      name: plugin.name,
      message: '인증이 필요합니다. MCP 연결이 올바르게 설정되어 있는지 확인해주세요.',
    }
  }

  // Admin can delete any plugin, others can only delete their own
  const hasAdminRole = userRole === 'admin'
  if (plugin.authorId !== userId && !hasAdminRole) {
    return {
      success: false,
      id,
      name: plugin.name,
      message: `본인이 배포한 플러그인만 삭제할 수 있습니다. '${plugin.name}'의 소유자가 아닙니다.`,
    }
  }

  // Delete the plugin
  await db.delete(catalogItems).where(eq(catalogItems.id, id))

  const adminNote = hasAdminRole && plugin.authorId !== userId ? ' (관리자 권한으로 삭제)' : ''
  return {
    success: true,
    id,
    name: plugin.name,
    message: `'${plugin.name}'이(가) 성공적으로 삭제되었습니다.${adminNote}`,
  }
}

/**
 * Check if the user has admin role
 */
function isAdmin(userRole?: string): boolean {
  return userRole === 'admin'
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<McpToolResponse> {
  // 관리자 도구 호출 차단
  const { isAdminTool } = await import('./tools')
  if (isAdminTool(toolName)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `'${toolName}'은(는) 관리자 전용 도구입니다. 일반 사용자는 'deploy_skill' 도구를 사용해주세요.`,
          }),
        },
      ],
      isError: true,
    }
  }

  const startTime = Date.now()
  try {
    switch (toolName) {
      case 'semantic_search': {
        const input = args as unknown as SemanticSearchInput
        if (!input.query) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Missing required field: query' }),
              },
            ],
            isError: true,
          }
        }
        const searchResult = await semanticSearchImpl({
          query: input.query,
          type: input.category,
          limit: Math.min(input.limit || 5, 20),
        })
        const result: SemanticSearchResult = {
          plugins: searchResult.items.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            description: item.description,
            authorName: 'Unknown',
            tags: item.tags || [],
            teamTag: item.teamTag || undefined,
            difficulty: item.difficulty || undefined,
            relevanceScore: item.similarity,
          })),
          total: searchResult.total,
          query: input.query,
          searchTime: searchResult.searchTime,
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'search_plugins': {
        const result = await searchPlugins(
          args as unknown as SearchPluginsInput,
          userId,
          userRole,
          orgId
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'get_plugin_content': {
        const input = args as unknown as GetPluginContentInput
        const result = await getPluginContent(input, userId, userRole, orgId)
        if (!result) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Plugin not found',
                  pluginId: input.pluginId,
                }),
              },
            ],
            isError: true,
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'list_plugins': {
        const result = await listPlugins(
          args as unknown as ListPluginsInput,
          userId,
          userRole,
          orgId
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'get_plugins_by_category': {
        const result = await getPluginsByCategory(args as unknown as GetPluginsByCategoryInput)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'create_plugin': {
        const input = args as unknown as CreatePluginInput
        if (!input.id || !input.type || !input.name || !input.content) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: id, type, name, content',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await createPlugin(input)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      case 'update_plugin': {
        const input = args as unknown as UpdatePluginInput
        if (!input.id) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Missing required field: id' }),
              },
            ],
            isError: true,
          }
        }
        const result = await updatePlugin(input)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      case 'delete_plugin': {
        const input = args as unknown as DeletePluginInput
        if (!input.id) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Missing required field: id' }),
              },
            ],
            isError: true,
          }
        }
        const result = await deletePlugin(input)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      // V2: Deploy and version management
      case 'deploy_skill': {
        const input = args as unknown as DeploySkillInput
        if (!input.type || !input.name || !input.content) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: type, name, content',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await deploySkill(input, userId, userRole, orgId)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      case 'undeploy_skill': {
        const input = args as unknown as UndeploySkillInput
        if (!input.id) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required field: id',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await undeploySkill(input, userId, userRole)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      case 'check_updates': {
        const input = args as unknown as CheckUpdatesInput
        if (!input.installations || !Array.isArray(input.installations)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required field: installations (array)',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await checkUpdates(input)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'suggest_improvement': {
        const input = args as unknown as SuggestImprovementInput
        if (!input.pluginId || !input.title || !input.description) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: pluginId, title, description',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await suggestImprovement(input, userId)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      case 'list_suggestions': {
        const input = args as unknown as ListSuggestionsInput
        const result = await listSuggestions(input)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'resolve_suggestion': {
        const input = args as unknown as ResolveSuggestionInput
        if (!input.suggestionId || !input.action) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: suggestionId, action',
                }),
              },
            ],
            isError: true,
          }
        }
        if (input.action !== 'accept' && input.action !== 'reject') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'action must be "accept" or "reject"',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await resolveSuggestion(input, userId, userRole)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        }
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
            },
          ],
          isError: true,
        }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error('Tool execution failed', error, { tool: toolName, duration: Date.now() - startTime })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
      isError: true,
    }
  } finally {
    log.info('Tool executed', { tool: toolName, duration: Date.now() - startTime })
  }
}

/**
 * List all available prompts
 */
export async function listPrompts(): Promise<McpPrompt[]> {
  return []
}

export async function getPrompt(input: GetPromptInput): Promise<McpPromptResult | null> {
  return null
}
