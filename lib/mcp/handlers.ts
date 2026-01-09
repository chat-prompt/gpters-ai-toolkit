/**
 * MCP Handler Functions for GPTers Marketplace
 *
 * Database query handlers for each MCP tool.
 */

import { db, catalogItems, users } from '../db'
import { ilike, or, eq, and, sql, inArray } from 'drizzle-orm'
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
} from './types'
import type { ItemType, TeamTag, CatalogItem } from '../core/types'
import { determineVersion, generateIdFromName, hasUpdate } from '../versioning/version'

/**
 * Search plugins by keyword
 * Searches across name, description, and tags
 */
export async function searchPlugins(input: SearchPluginsInput): Promise<SearchResult> {
  const { query, category, teamTag, limit = 5 } = input
  const safeLimit = Math.min(Math.max(1, limit), 20)

  const searchPattern = `%${query}%`

  // Build search condition
  const searchCondition = or(
    ilike(catalogItems.name, searchPattern),
    ilike(catalogItems.description, searchPattern),
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
 * Get full content of a specific plugin
 */
export async function getPluginContent(input: GetPluginContentInput): Promise<PluginContent | null> {
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
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(eq(catalogItems.id, pluginId))
    .limit(1)

  if (results.length === 0) {
    return null
  }

  const item = results[0]

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
  }
}

/**
 * List all plugins with optional filters
 */
export async function listPlugins(input: ListPluginsInput = {}): Promise<ListResult> {
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
 */
export async function deploySkill(input: DeploySkillInput): Promise<DeploySkillResponse> {
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
    status = 'published',
    changelog: explicitChangelog,
    files,
  } = input

  // Generate ID from name if not provided
  const id = providedId || generateIdFromName(name)

  // Check if this is an update or new deployment
  const existing = await db
    .select({
      id: catalogItems.id,
      content: catalogItems.content,
      version: catalogItems.version,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  const isUpdate = existing.length > 0
  const existingItem = isUpdate ? existing[0] : null

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
        status,
        version: versionInfo.version,
        changelog: versionInfo.changelog,
        files: files || null,
        mcpEnabled: status === 'published',
        updatedAt: now,
      })
      .where(eq(catalogItems.id, id))
  } else {
    // Create new item
    // Note: authorId should be set by API route based on authenticated user
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
      status,
      version: versionInfo.version,
      changelog: versionInfo.changelog,
      files: files || null,
      mcpEnabled: status === 'published',
      likes: 0,
      dependencies: [],
      createdAt: now,
      updatedAt: now,
    })
  }

  // Build response
  const response: DeploySkillResponse = {
    success: true,
    id,
    version: versionInfo.version,
    previousVersion: existingItem?.version || undefined,
    changelog: versionInfo.changelog,
    status,
    webUrl: `https://company-ai-toolkit.vercel.app/${type}/${id}`,
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
 * Execute a tool call and return MCP-formatted response
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResponse> {
  try {
    switch (toolName) {
      case 'search_plugins': {
        const result = await searchPlugins(args as unknown as SearchPluginsInput)
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
        const result = await getPluginContent(input)
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
        const result = await listPlugins(args as unknown as ListPluginsInput)
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
        const result = await deploySkill(input)
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
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
      isError: true,
    }
  }
}

/**
 * GPTers Setup Skill Content
 * This is the only prompt exposed via MCP - it bootstraps the hook/CLAUDE.md setup
 */
const GPTERS_SETUP_SKILL = {
  id: 'gpters-setup',
  name: 'GPTers AI Toolkit 설정',
  description: 'Hook과 CLAUDE.md를 설치하여 팀 공유 스킬을 자연스럽게 사용할 수 있게 합니다.',
  content: `# GPTers AI Toolkit 설정

이 스킬은 GPTers 팀 공유 플러그인을 자연스럽게 사용할 수 있도록 프로젝트를 설정합니다.

## 설치할 파일

### 1. CLAUDE.md (프로젝트 루트에 추가 또는 병합)

\`\`\`markdown
# GPTers AI Toolkit 연동

## 플러그인 검색 규칙

새 작업 시작 전, 관련 플러그인이 있는지 확인하세요:

\\\`\\\`\\\`
gpters-ai-toolkit search_plugins("키워드")
\\\`\\\`\\\`

### 추천 검색어

| 작업 | 검색어 |
|------|--------|
| DB 스키마/테이블 구조 | data-source |
| 코드 리팩토링 | refactor |
| 코드 리뷰 | review |
| 배포/공유 | deploy |

## 플러그인 배포

만든 스킬을 팀과 공유하려면:

\\\`\\\`\\\`
gpters-ai-toolkit deploy_skill(type="skill", name="스킬명", content="...")
\\\`\\\`\\\`
\`\`\`

### 2. .claude/settings.json (Hook 설정)

\`\`\`json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "command": "echo '💡 Tip: gpters-ai-toolkit search_plugins로 팀 공유 플러그인 검색'",
        "blocking": false
      }
    ]
  }
}
\`\`\`

## 설치 방법

1. 위 CLAUDE.md 내용을 프로젝트 루트의 CLAUDE.md에 추가하세요
2. .claude/settings.json 파일을 생성하고 Hook 설정을 추가하세요
3. 이후 작업 시 자연스럽게 플러그인 검색 힌트가 표시됩니다

## 확인

설치 후 다음 명령으로 플러그인 검색이 되는지 확인:

\`\`\`
gpters-ai-toolkit search_plugins("")
\`\`\`
`,
}

/**
 * List all available prompts
 * Only exposes gpters-setup for bootstrapping - catalog items are discovered via search
 */
export async function listPrompts(): Promise<McpPrompt[]> {
  return [
    {
      name: GPTERS_SETUP_SKILL.id,
      description: GPTERS_SETUP_SKILL.description,
    },
  ]
}

export async function getPrompt(input: GetPromptInput): Promise<McpPromptResult | null> {
  const { name } = input

  if (name !== GPTERS_SETUP_SKILL.id) {
    return null
  }

  return {
    description: GPTERS_SETUP_SKILL.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: GPTERS_SETUP_SKILL.content,
        },
      },
    ],
  }
}
