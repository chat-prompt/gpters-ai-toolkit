/**
 * MCP Handler Functions for GPTers Marketplace
 *
 * Database query handlers for each MCP tool.
 */

import { randomUUID } from 'node:crypto'
import { createLogger } from '../core/logger'
import { db, catalogItems, users, axClientUsage, axUsageCollectorState } from '@gpters/db'
import { validateUsageReport } from '../features/ax/usage-report'
import type { AxUsageReportRecord } from '../features/ax/usage-report'
import { validateSkillExecutionReport, validateSkillExecutionStart } from '../features/ax/execution-report'
import { validateOptionalJourneyId } from '../features/ax/journey'
import { resolveAgentsAsConfig } from '../plugin/dependency-resolver'
import { checkMetadataQuality } from '../plugin/skill-validator'
import { isSuperAdmin, type UserRole } from '../security/rbac'
import { notifySlackDeploy } from '../notifications/slack'

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
  UndeploySkillInput,
  UndeploySkillResponse,
  SemanticSearchInput,
  SemanticSearchResult,
  AddFilesInput,
  AddFilesResponse,
  RemoveFilesInput,
  RemoveFilesResponse,
} from './types'
import type { ItemType, CatalogItem } from '../core/types'
import { determineVersion, generateIdFromName, hasUpdate, incrementVersion } from '../versioning/version'
import { analyzeChanges, createVersionSnapshot } from '../versioning/skill-version'
import { getBaseUrl } from '../utils'
import { generateEmbedding, prepareTextForEmbedding } from '../search/embedding'
import { checkDeployDuplicates } from '../features/ax/deploy-duplicate-guard'
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
 * Search plugins by keyword in the single GPTers catalog
 * Searches across name, description, and tags
 * 
 * @param input - Search parameters
 * @param userId - Authenticated user ID (retained for API compatibility)
 * @param userRole - User's role (retained for API compatibility)
 * @param orgId - User's organization ID (retained for API compatibility)
 */
export async function searchPlugins(
  input: SearchPluginsInput,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<SearchResult> {
  const { query, category, limit = 5 } = input
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

  // Only include marketplace-enabled items
  conditions.push(eq(catalogItems.mcpEnabled, true))

  const whereClause = and(...conditions)

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
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
    difficulty: item.difficulty || undefined,
  }))

  return {
    plugins,
    total: plugins.length,
    query,
  }
}

/**
 * Get full content of a specific plugin from the single GPTers catalog
 * Returns null if the plugin is not found
 * 
 * @param input - Plugin content request
 * @param userId - Authenticated user ID (retained for API compatibility)
 * @param userRole - User's role (retained for API compatibility)
 * @param orgId - User's organization ID (retained for API compatibility)
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
      platforms: catalogItems.platforms,
      version: catalogItems.version,
      status: catalogItems.status,
      changelog: catalogItems.changelog,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(eq(catalogItems.id, pluginId))
    .limit(1)

  if (results.length === 0) {
    return null
  }

  const item = results[0]

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
    difficulty: item.difficulty || undefined,
    platforms: item.platforms || undefined,
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
 * List all plugins with optional filters
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
  const { category } = input

  const conditions = []

  if (category && category !== 'all') {
    conditions.push(eq(catalogItems.type, category as ItemType))
  }

  // Only include marketplace-enabled items
  conditions.push(eq(catalogItems.mcpEnabled, true))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
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
export async function getPluginsByCategory(
  input: GetPluginsByCategoryInput,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<ListResult> {
  const { category, limit = 10 } = input
  const safeLimit = Math.min(Math.max(1, limit), 50)

  const conditions = [
    eq(catalogItems.type, category),
    eq(catalogItems.mcpEnabled, true),
  ]

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      authorName: users.name,
      tags: catalogItems.tags,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(and(...conditions))
    .limit(safeLimit)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    authorName: item.authorName || 'Unknown',
    tags: item.tags || [],
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
  const { id, type, name, description, content, tags, readme, files, mcpEnabled } = input

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
    allowedTools,
    agentModel,
    agentPermissionMode,
    agentSkills,
    status = 'published',
    changelog: explicitChangelog,
    files,
    dependencies,
    platforms,
  } = input

  // Generate ID from name if not provided
  const id = providedId || generateIdFromName(name)

  // Validate ID format — only allow lowercase alphanumeric and hyphens
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && !/^[a-z0-9]$/.test(id)) {
    return {
      success: false,
      id,
      version: '0.0.0',
      changelog: '',
      status: 'published',
      webUrl: '',
      error: `ID "${id}"에 허용되지 않는 문자가 포함되어 있습니다. 영문 소문자, 숫자, 하이픈만 사용 가능합니다. (예: "my-skill-name")`,
    }
  }

  // Check if this is an update or new deployment
  const existing = await db
    .select({
      id: catalogItems.id,
      content: catalogItems.content,
      version: catalogItems.version,
      authorId: catalogItems.authorId,
      files: catalogItems.files,
      orgId: catalogItems.orgId,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  const isUpdate = existing.length > 0
  const existingItem = isUpdate ? existing[0] : null

  // Validate required metadata for new deployments
  if (!isUpdate) {
    const missingFields: string[] = []
    if (!description || description.trim().length === 0) {
      missingFields.push('description')
    }
    if (!tags || tags.length === 0) {
      missingFields.push('tags')
    }
    if (missingFields.length > 0) {
      return {
        success: false,
        id,
        version: '0.0.0',
        changelog: '',
        status: 'published',
        webUrl: '',
          error: `신규 배포 시 ${missingFields.join(', ')}은(는) 필수입니다. description(스킬 설명)과 tags(관련 키워드 배열)를 포함해주세요.`,
      }
    }
  }

  // Authentication is required for updates; any org member may update
  if (isUpdate && existingItem) {
    if (!authorId) {
      return {
        success: false,
        id,
        version: existingItem.version || '1.0.0',
        changelog: '',
        status: 'published',
        webUrl: '',
          error: '인증이 필요합니다. MCP 연결이 올바르게 설정되어 있는지 확인해주세요.',
      }
    }

    // Cross-org guard: only members of the owning org (or super_admin) may update.
    // Mirrors the REST PUT guard in apps/web/app/api/catalog/[id]/route.ts.
    const isSuperAdminUser = userRole && isSuperAdmin(userRole as UserRole)
    if (!isSuperAdminUser && existingItem.orgId && existingItem.orgId !== orgId) {
      return {
        success: false,
        id,
        version: existingItem.version || '1.0.0',
        changelog: '',
        status: 'published',
        webUrl: '',
        error: '다른 조직의 스킬은 수정할 수 없습니다.',
      }
    }
  }

  // Resolve content and files: use existing values for partial updates
  const resolvedContent = content ?? existingItem?.content
  const resolvedFiles = files !== undefined ? (files || null) : (existingItem?.files ?? null)

  // New deployments require content
  if (!isUpdate && !resolvedContent) {
    return {
      success: false,
      id,
      version: '1.0.0',
      changelog: '',
      status: 'published',
      webUrl: '',
      error: '새 배포 시 content는 필수입니다.',
    }
  }

  // Enforce changelog: required on content-changing updates, auto-fill on new deployments.
  // Metadata-only updates (tags/description/etc) are exempt to match REST PUT behavior.
  let effectiveChangelog = explicitChangelog?.trim() ?? ''
  if (isUpdate) {
    const hasContentChange =
      resolvedContent !== undefined &&
      analyzeChanges(existingItem!.content, resolvedContent).hasChanges
    if (hasContentChange && !effectiveChangelog) {
      return {
        success: false,
        id,
        version: existingItem!.version || '1.0.0',
        changelog: '',
        status: 'published',
        webUrl: '',
        error: '업데이트 시 changelog는 필수입니다. 이번 변경 사유를 한 줄 이상 적어주세요.',
      }
    }
  } else if (!effectiveChangelog) {
    effectiveChangelog = 'Initial release'
  }

  // 새 배포일 때만 중복을 본다. 업데이트는 자기 자신과 비교할 일이 없다.
  // 막지 않고 경고만 한다 — 차단하면 의도적으로 갈라놓는 경우까지 막힌다.
  const duplicateWarning = isUpdate
    ? null
    : await checkDeployDuplicates({ id, type, content: resolvedContent ?? '' })

  // Run non-blocking metadata quality check
  const qualityWarnings = checkMetadataQuality({
    description,
    tags,
    content: resolvedContent ?? undefined,
  })

  // Determine version
  const versionInfo = determineVersion(
    existingItem ? { content: existingItem.content, version: existingItem.version || '1.0.0' } : null,
    resolvedContent!,
    effectiveChangelog
  )

  const now = new Date()

  if (isUpdate) {
    // Update existing item - only update provided fields, preserve existing for omitted ones
    await db
      .update(catalogItems)
      .set({
        name,
        content: resolvedContent!,
        description: description || '',
        tags: tags || [],
        allowedTools: allowedTools || null,
        agentModel: agentModel || null,
        agentPermissionMode: agentPermissionMode || null,
        agentSkills: agentSkills || null,
        status,
        version: versionInfo.version,
        changelog: versionInfo.changelog,
        files: resolvedFiles,
        dependencies: dependencies || [],
        platforms: platforms || null,
        mcpEnabled: status === 'published',
        visibility: 'public',
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
      content: resolvedContent!,
      description: description || '',
      tags: tags || [],
      allowedTools: allowedTools || null,
      agentModel: agentModel || null,
      agentPermissionMode: agentPermissionMode || null,
      agentSkills: agentSkills || null,
      status,
      version: versionInfo.version,
      changelog: versionInfo.changelog,
      files: resolvedFiles,
      mcpEnabled: status === 'published',
      likes: 0,
      dependencies: dependencies || [],
      platforms: platforms || null,
      authorId: authorId || null,
      orgId: orgId || null,
      visibility: 'public',
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    })
  }

  updateItemEmbedding(id, { name, description: description || '', content: resolvedContent!, tags }).catch(() => {})

  const BASE_URL = getBaseUrl()

  const response: DeploySkillResponse = {
    success: true,
    id,
    version: versionInfo.version,
    previousVersion: existingItem?.version || undefined,
    changelog: versionInfo.changelog,
    status,
    webUrl: `${BASE_URL}/${type}/${id}`,
    ...(qualityWarnings.length > 0 ? { qualityWarnings } : {}),
    ...(duplicateWarning ? { duplicateWarning } : {}),
  }

  // Fire-and-forget Slack notification
  const resolveAuthorName = authorId
    ? db.select({ name: users.name }).from(users).where(eq(users.id, authorId)).limit(1)
        .then((rows) => rows[0]?.name || undefined)
        .catch(() => undefined)
    : Promise.resolve(undefined)

  resolveAuthorName.then((authorName) =>
    notifySlackDeploy({
      id,
      name,
      type,
      version: versionInfo.version,
      previousVersion: existingItem?.version || undefined,
      changelog: versionInfo.changelog,
      authorName,
      webUrl: response.webUrl,
      status,
      content: resolvedContent!,
    })
  ).catch(() => {})

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
 * Add files to an existing plugin (merge strategy: keep existing, overwrite same name, add new)
 *
 * @param input - Add files input with plugin ID and files array
 * @param userId - Authenticated user ID (required for ownership check)
 * @param userRole - Authenticated user's role (admin can override ownership check)
 */
export async function addFiles(
  input: AddFilesInput,
  userId?: string,
  userRole?: string
): Promise<AddFilesResponse> {
  const { id, files: newFiles } = input

  const existing = await db
    .select({
      id: catalogItems.id,
      version: catalogItems.version,
      authorId: catalogItems.authorId,
      files: catalogItems.files,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length === 0) {
    return {
      success: false,
      id,
      version: '',
      previousVersion: '',
      addedOrUpdated: [],
      totalFiles: 0,
      files: [],
      error: `플러그인 '${id}'을(를) 찾을 수 없습니다`,
    }
  }

  const item = existing[0]

  if (!userId) {
    return {
      success: false,
      id,
      version: item.version || '1.0.0',
      previousVersion: item.version || '1.0.0',
      addedOrUpdated: [],
      totalFiles: 0,
      files: [],
      error: '인증이 필요합니다. MCP 연결이 올바르게 설정되어 있는지 확인해주세요.',
    }
  }

  const hasAdminRole = userRole === 'admin'
  if (item.authorId !== userId && !hasAdminRole) {
    return {
      success: false,
      id,
      version: item.version || '1.0.0',
      previousVersion: item.version || '1.0.0',
      addedOrUpdated: [],
      totalFiles: 0,
      files: [],
      error: `본인이 배포한 플러그인만 수정할 수 있습니다. 소유자가 아닙니다.`,
    }
  }

  // Merge files: use Map for name-based merge
  const fileMap = new Map<string, PluginFileWithType>()
  const existingFiles = (item.files || []) as PluginFileWithType[]
  for (const f of existingFiles) {
    fileMap.set(f.name, f)
  }

  const addedOrUpdated: string[] = []
  for (const f of newFiles) {
    const typed: PluginFileWithType = {
      name: f.name,
      content: f.content,
      type: inferFileType(f),
    }
    fileMap.set(f.name, typed)
    addedOrUpdated.push(f.name)
  }

  const mergedFiles = Array.from(fileMap.values())
  const previousVersion = item.version || '1.0.0'
  const newVersion = incrementVersion(previousVersion, 'patch')

  await db
    .update(catalogItems)
    .set({
      files: mergedFiles,
      version: newVersion,
      changelog: `파일 추가/업데이트: ${addedOrUpdated.join(', ')}`,
      updatedAt: new Date(),
    })
    .where(eq(catalogItems.id, id))

  // Create version snapshot
  const [updatedItem] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (updatedItem) {
    await createVersionSnapshot(updatedItem, {
      version: newVersion,
      versionType: 'patch',
      changelog: `파일 추가/업데이트: ${addedOrUpdated.join(', ')}`,
      createdBy: userId,
    }).catch((err) => {
      log.error('Failed to create version snapshot', err)
    })
  }

  return {
    success: true,
    id,
    version: newVersion,
    previousVersion,
    addedOrUpdated,
    totalFiles: mergedFiles.length,
    files: mergedFiles,
  }
}

/**
 * Remove files from an existing plugin by file name
 *
 * @param input - Remove files input with plugin ID and file names
 * @param userId - Authenticated user ID (required for ownership check)
 * @param userRole - Authenticated user's role (admin can override ownership check)
 */
export async function removeFiles(
  input: RemoveFilesInput,
  userId?: string,
  userRole?: string
): Promise<RemoveFilesResponse> {
  const { id, fileNames } = input

  const existing = await db
    .select({
      id: catalogItems.id,
      version: catalogItems.version,
      authorId: catalogItems.authorId,
      files: catalogItems.files,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length === 0) {
    return {
      success: false,
      id,
      version: '',
      previousVersion: '',
      removed: [],
      notFound: [],
      totalFiles: 0,
      files: null,
      error: `플러그인 '${id}'을(를) 찾을 수 없습니다`,
    }
  }

  const item = existing[0]

  if (!userId) {
    return {
      success: false,
      id,
      version: item.version || '1.0.0',
      previousVersion: item.version || '1.0.0',
      removed: [],
      notFound: [],
      totalFiles: 0,
      files: null,
      error: '인증이 필요합니다. MCP 연결이 올바르게 설정되어 있는지 확인해주세요.',
    }
  }

  const hasAdminRole = userRole === 'admin'
  if (item.authorId !== userId && !hasAdminRole) {
    return {
      success: false,
      id,
      version: item.version || '1.0.0',
      previousVersion: item.version || '1.0.0',
      removed: [],
      notFound: [],
      totalFiles: 0,
      files: null,
      error: `본인이 배포한 플러그인만 수정할 수 있습니다. 소유자가 아닙니다.`,
    }
  }

  const existingFiles = (item.files || []) as PluginFileWithType[]
  const existingNameSet = new Set(existingFiles.map((f) => f.name))

  const removed: string[] = []
  const notFound: string[] = []

  for (const name of fileNames) {
    if (existingNameSet.has(name)) {
      removed.push(name)
    } else {
      notFound.push(name)
    }
  }

  const previousVersion = item.version || '1.0.0'

  // Skip version bump if nothing was actually removed
  if (removed.length === 0) {
    return {
      success: true,
      id,
      version: previousVersion,
      previousVersion,
      removed: [],
      notFound,
      totalFiles: existingFiles.length,
      files: existingFiles.length > 0 ? existingFiles : null,
    }
  }

  const removeSet = new Set(removed)
  const remainingFiles = existingFiles.filter((f) => !removeSet.has(f.name))
  const newVersion = incrementVersion(previousVersion, 'patch')
  const resultFiles = remainingFiles.length > 0 ? remainingFiles : null

  await db
    .update(catalogItems)
    .set({
      files: resultFiles,
      version: newVersion,
      changelog: `파일 삭제: ${removed.join(', ')}`,
      updatedAt: new Date(),
    })
    .where(eq(catalogItems.id, id))

  // Create version snapshot
  const [updatedItem] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (updatedItem) {
    await createVersionSnapshot(updatedItem, {
      version: newVersion,
      versionType: 'patch',
      changelog: `파일 삭제: ${removed.join(', ')}`,
      createdBy: userId,
    }).catch((err) => {
      log.error('Failed to create version snapshot', err)
    })
  }

  return {
    success: true,
    id,
    version: newVersion,
    previousVersion,
    removed,
    notFound,
    totalFiles: remainingFiles.length,
    files: resultFiles,
  }
}

/**
 * `report_usage` 결과
 */
export interface ReportUsageResponse {
  success: boolean
  /** 서버가 인증 사용자에서 유도한 팀원 이름 (성공 시에만) */
  memberName?: string
  /** 새로 만든 행 수 */
  inserted?: number
  /** 덮어쓴 행 수 */
  updated?: number
  error?: string
  /** 검증 실패 시 필드별 사유 */
  errors?: string[]
}

/**
 * 인증 사용자로부터 팀원 이름을 얻는다
 *
 * 클라이언트가 보낸 이름을 쓰지 않는 이유는 남의 이름으로 사용량을 기록할 수 있기 때문이다.
 * 이름이 비어 있는 계정은 이메일 로컬파트로 대신한다 — 대시보드가 사람을 묶는 키라
 * 비어 있으면 행이 통째로 유실된다.
 *
 * @param userId - 인증 세션의 사용자 ID
 * @returns 팀원 이름. 사용자를 못 찾으면 null
 */
async function resolveMemberName(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return null
  return user.name?.trim() || user.email?.split('@')[0] || null
}

/**
 * CLI가 보낸 사용량 집계를 `ax_client_usage`에 반영한다
 *
 * (userId, client, periodStart)를 키로 upsert 한다. 같은 사람이 같은 구간을
 * 다시 보내면 덮어쓰므로, CLI를 몇 번 돌려도 대시보드 총량이 부풀지 않는다.
 *
 * @param args - MCP 도구 인자 (`{ records: [...] }`)
 * @param userId - 인증 세션의 사용자 ID
 * @returns 반영 결과. 검증 실패 시 사유를 그대로 담아 돌려준다
 */
export async function reportUsage(
  args: Record<string, unknown>,
  userId?: string
): Promise<ReportUsageResponse> {
  if (!userId) {
    return { success: false, error: '인증이 필요합니다' }
  }

  const validation = validateUsageReport(args)
  if (!validation.ok) {
    return { success: false, error: validation.errors.join('; '), errors: validation.errors }
  }

  const memberName = await resolveMemberName(userId)
  if (!memberName) {
    return { success: false, error: '인증 사용자를 찾을 수 없습니다' }
  }

  let inserted = 0
  let updated = 0

  for (const record of validation.payload.records) {
    const values = toUsageRow(record, userId, memberName)

    const [existing] = await db
      .select({ id: axClientUsage.id })
      .from(axClientUsage)
      .where(
        and(
          eq(axClientUsage.userId, userId),
          eq(axClientUsage.client, values.client),
          eq(axClientUsage.periodStart, values.periodStart)
        )
      )
      .limit(1)

    if (existing) {
      await db.update(axClientUsage).set(values).where(eq(axClientUsage.id, existing.id))
      updated++
    } else {
      await db.insert(axClientUsage).values(values)
      inserted++
    }
  }

  // 사용량이 0건이어도 수집기가 설치·승인된 상태로 정상 실행됐다는 사실은 남긴다.
  // 이 heartbeat가 없으면 관리자 화면은 "미사용"과 "미설치"를 구분할 수 없다.
  const now = new Date()
  const collectorState = {
    userId,
    memberName,
    clients: validation.payload.records.map((record) => record.client),
    recordCount: validation.payload.records.length,
    lastReportedAt: now,
    updatedAt: now,
  }
  await db
    .insert(axUsageCollectorState)
    .values(collectorState)
    .onConflictDoUpdate({
      target: axUsageCollectorState.userId,
      set: collectorState,
    })

  log.info('AX usage reported', {
    memberName,
    inserted,
    updated,
    records: validation.payload.records.length,
  })
  return { success: true, memberName, inserted, updated }
}

/**
 * 검증을 통과한 레코드를 `ax_client_usage` 행으로 옮긴다
 *
 * @param record - 검증된 레코드
 * @param userId - 인증 사용자 ID
 * @param memberName - 서버가 유도한 팀원 표시명 스냅샷
 * @returns insert·update 양쪽에 그대로 쓰는 값
 */
function toUsageRow(record: AxUsageReportRecord, userId: string, memberName: string) {
  const now = new Date()
  return {
    userId,
    memberName,
    client: record.client,
    planRaw: record.planRaw,
    plan: record.plan,
    periodStart: new Date(record.periodStart),
    periodEnd: new Date(record.periodEnd),
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cachedTokens: record.cachedTokens,
    sessions: record.sessions,
    models: record.models,
    // numeric 컬럼은 드라이버가 문자열을 받는다. null은 "한도를 안 주는 클라이언트"라는 뜻이라
    // 0으로 바꾸지 않는다.
    limitUsedPercent: record.limitUsedPercent != null ? record.limitUsedPercent.toFixed(2) : null,
    limitResetsAt: record.limitResetsAt ? new Date(record.limitResetsAt) : null,
    syncedAt: now,
    updatedAt: now,
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
  orgId?: string,
  clientType?: string
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
        const journeyValidation = validateOptionalJourneyId(input._journeyId)
        if (!journeyValidation.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: journeyValidation.error }) }],
            isError: true,
          }
        }
        const journeyId = journeyValidation.value ?? randomUUID()
        const searchResult = await semanticSearchImpl({
          query: input.query,
          type: input.category,
          limit: Math.min(input.limit || 5, 20),
          userId,
          userRole,
          orgId,
          userContext: input.userContext,
          clientType,
        })
        // authorId → authorName 매핑
        const authorIds = [...new Set(searchResult.items.map((item) => item.authorId).filter(Boolean))] as string[]
        const authorMap = new Map<string, string>()
        if (authorIds.length > 0) {
          const authorRows = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, authorIds))
          for (const row of authorRows) {
            if (row.name) authorMap.set(row.id, row.name)
          }
        }

        const result: SemanticSearchResult = {
          plugins: searchResult.items.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            description: item.description,
            authorName: (item.authorId && authorMap.get(item.authorId)) || 'Unknown',
            tags: item.tags || [],
                    difficulty: item.difficulty || undefined,
            platforms: item.platforms || undefined,
            relevanceScore: item.similarity,
          })),
          total: searchResult.total,
          query: input.query,
          searchTime: searchResult.searchTime,
          journeyId,
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          _meta: {
            journeyId,
            searchResults: searchResult.items.map((item, idx) => ({
              itemId: item.id,
              rank: idx + 1,
              score: item.similarity ?? 0,
            })),
            referralSource: input._source === 'skill-suggest' ? 'suggest' : (input._source || 'direct'),
          },
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
        const journeyValidation = validateOptionalJourneyId(input._journeyId)
        if (!journeyValidation.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: journeyValidation.error }) }],
            isError: true,
          }
        }
        const journeyId = journeyValidation.value ?? randomUUID()
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
        // Append outcome reporting instruction to skill content
        const outcomeHint = `\n\n---\n_실제 적용을 결정했다면 먼저 report_skill_execution_started를 호출해주세요(skillId="${input.pluginId}", journeyId="${journeyId}", agent=현재 런타임, agentId=안정적인 봇 ID). 적용·검증 뒤 응답의 attemptId로 report_skill_execution을 완료합니다. 적용하지 않았다면 report_skill_outcome(skillId="${input.pluginId}", journeyId="${journeyId}", applied=false, summary="한 줄 사유")를 호출해주세요._`
        const resultWithHint = { ...result, journeyId }
        if (typeof resultWithHint.content === 'string') {
          resultWithHint.content = resultWithHint.content + outcomeHint
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(resultWithHint, null, 2),
            },
          ],
          _meta: { journeyId },
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
        const result = await getPluginsByCategory(args as unknown as GetPluginsByCategoryInput, userId, userRole, orgId)
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
        if (!input.type || !input.name) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: type, name',
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

      case 'add_files': {
        const input = args as unknown as AddFilesInput
        if (!input.id || !input.files || !Array.isArray(input.files) || input.files.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: id, files (non-empty array)',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await addFiles(input, userId, userRole)
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

      case 'report_session_event': {
        const eventType = args.eventType as string | undefined
        if (!eventType || !['session_summary', 'session_end'].includes(eventType)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing or invalid eventType. Must be "session_summary" or "session_end"',
                }),
              },
            ],
            isError: true,
          }
        }
        // Client context merge is handled in the route layer (needs sessionId from headers)
        // This case just returns success; actual merge happens via _meta passthrough
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Session event '${eventType}' received`,
              }),
            },
          ],
          _meta: {
            sessionEvent: {
              eventType,
              promptCount: args.promptCount as number | undefined,
              suggestionsShown: args.suggestionsShown as number | undefined,
              suggestionsUsed: args.suggestionsUsed as number | undefined,
              skippedSearches: args.skippedSearches as number | undefined,
              sessionEndReason: args.sessionEndReason as string | undefined,
              pluginVersion: args.pluginVersion as string | undefined,
            },
          },
        }
      }

      case 'report_usage': {
        const result = await reportUsage(args, userId)
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

      case 'report_search_skip': {
        const query = args.query as string | undefined
        const resultIds = args.resultIds as string[] | undefined
        const reason = args.reason as string | undefined
        if (!query || !resultIds || !reason) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required fields: query, resultIds, reason' }) }],
            isError: true,
          }
        }
        log.info('Search skip reported', { query, resultIds, reason })
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Skip reason recorded' }) }],
          _meta: {
            searchSkip: { query, resultIds, reason },
          },
        }
      }

      case 'report_skill_outcome': {
        const skillId = args.skillId as string | undefined
        const applied = args.applied as boolean | undefined
        const summary = args.summary as string | undefined
        if (!skillId || applied === undefined || !summary) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required fields: skillId, applied, summary' }) }],
            isError: true,
          }
        }
        const journeyValidation = validateOptionalJourneyId(args.journeyId)
        if (!journeyValidation.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: journeyValidation.error }) }],
            isError: true,
          }
        }
        log.info('Skill outcome reported', { skillId, applied, summary })
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Outcome recorded' }) }],
          _meta: {
            journeyId: journeyValidation.value ?? undefined,
            skillOutcome: {
              skillId,
              applied,
              summary,
              ...(journeyValidation.value && { journeyId: journeyValidation.value }),
            },
          },
        }
      }

      case 'report_skill_execution_started': {
        const agent = typeof args.agent === 'string' ? args.agent : ''
        const normalizedArgs = {
          ...args,
          eventId: args.eventId ?? randomUUID(),
          attemptId: args.attemptId ?? randomUUID(),
          source: args.source ?? 'aitk',
          journeyId: args.journeyId ?? null,
          skillVersion: args.skillVersion ?? null,
          agentId: args.agentId ?? agent,
          occurredAt: args.occurredAt ?? new Date().toISOString(),
        }
        const validation = validateSkillExecutionStart(normalizedArgs)
        if (!validation.ok) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: 'Invalid execution start report', details: validation.errors }),
            }],
            isError: true,
          }
        }
        log.info('Skill execution start reported', {
          attemptId: validation.data.attemptId,
          skillId: validation.data.skillId,
          agentId: validation.data.agentId,
        })
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            message: 'Execution start recorded',
            attemptId: validation.data.attemptId,
            eventId: validation.data.eventId,
          }) }],
          _meta: { skillExecutionStart: validation.data },
        }
      }

      case 'report_skill_execution': {
        const agent = typeof args.agent === 'string' ? args.agent : ''
        const rawValidation = typeof args.validation === 'object' && args.validation !== null
          ? args.validation as Record<string, unknown>
          : {}
        const normalizedArgs = {
          ...args,
          eventId: args.eventId ?? randomUUID(),
          source: args.source ?? 'aitk',
          journeyId: args.journeyId ?? null,
          skillVersion: args.skillVersion ?? null,
          agentId: args.agentId ?? agent,
          failureStage: args.failureStage ?? null,
          errorCode: args.errorCode ?? null,
          validation: {
            method: rawValidation.method ?? 'none',
            passed: rawValidation.passed ?? null,
            summary: rawValidation.summary ?? null,
          },
          userAccepted: args.userAccepted ?? null,
          occurredAt: args.occurredAt ?? new Date().toISOString(),
        }
        const validation = validateSkillExecutionReport(normalizedArgs)
        if (!validation.ok) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: 'Invalid execution report', details: validation.errors }),
            }],
            isError: true,
          }
        }
        log.info('Skill execution reported', {
          attemptId: validation.data.attemptId,
          skillId: validation.data.skillId,
          status: validation.data.status,
          validationMethod: validation.data.validation.method,
        })
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            message: 'Execution recorded',
            attemptId: validation.data.attemptId,
            eventId: validation.data.eventId,
          }) }],
          _meta: { skillExecution: validation.data },
        }
      }

      case 'remove_files': {
        const input = args as unknown as RemoveFilesInput
        if (!input.id || !input.fileNames || !Array.isArray(input.fileNames) || input.fileNames.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Missing required fields: id, fileNames (non-empty array)',
                }),
              },
            ],
            isError: true,
          }
        }
        const result = await removeFiles(input, userId, userRole)
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
