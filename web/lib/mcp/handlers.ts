/**
 * MCP Handler Functions for GPTers Marketplace
 *
 * Database query handlers for each MCP tool.
 */

import { db, catalogItems } from '../db'
import { ilike, or, eq, and, sql } from 'drizzle-orm'
import type {
  SearchPluginsInput,
  GetPluginContentInput,
  ListPluginsInput,
  GetPluginsByCategoryInput,
  GetPromptInput,
  CreatePluginInput,
  UpdatePluginInput,
  DeletePluginInput,
  PluginSummary,
  PluginContent,
  SearchResult,
  ListResult,
  McpToolResponse,
  McpPrompt,
  McpPromptResult,
} from './types'
import type { ItemType, TeamTag } from '../types'

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
  conditions.push(eq(catalogItems.marketplaceEnabled, true))

  const whereClause = and(...conditions)

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      author: catalogItems.author,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .where(whereClause)
    .limit(safeLimit)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    author: item.author,
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
    .select()
    .from(catalogItems)
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
    author: item.author,
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
  conditions.push(eq(catalogItems.marketplaceEnabled, true))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      author: catalogItems.author,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .where(whereClause)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    author: item.author,
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
      author: catalogItems.author,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
      difficulty: catalogItems.difficulty,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.type, category),
        eq(catalogItems.marketplaceEnabled, true)
      )
    )
    .limit(safeLimit)

  const plugins: PluginSummary[] = results.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    author: item.author,
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
  const { id, type, name, description, content, author, tags, teamTag, readme, files, marketplaceEnabled } = input

  // Check if plugin already exists
  const existing = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1)

  if (existing.length > 0) {
    return { success: false, id, error: `Plugin with ID '${id}' already exists` }
  }

  await db.insert(catalogItems).values({
    id,
    type,
    name,
    description: description || '',
    content,
    author: author || 'unknown',
    tags: tags || [],
    teamTag: (teamTag as TeamTag) || 'general',
    readme: readme || null,
    files: files || null,
    marketplaceEnabled: marketplaceEnabled || false,
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
  if (updateFields.author !== undefined) updateData.author = updateFields.author
  if (updateFields.tags !== undefined) updateData.tags = updateFields.tags
  if (updateFields.teamTag !== undefined) updateData.teamTag = updateFields.teamTag
  if (updateFields.readme !== undefined) updateData.readme = updateFields.readme
  if (updateFields.files !== undefined) updateData.files = updateFields.files
  if (updateFields.marketplaceEnabled !== undefined) updateData.marketplaceEnabled = updateFields.marketplaceEnabled

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
 * List all available prompts (plugins as MCP prompts)
 * Each plugin becomes an invocable prompt via /mcp__gpters-marketplace__<plugin-id>
 */
export async function listPrompts(): Promise<McpPrompt[]> {
  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      commandArgumentHint: catalogItems.commandArgumentHint,
    })
    .from(catalogItems)
    .where(eq(catalogItems.marketplaceEnabled, true))

  return results.map((item) => {
    const prompt: McpPrompt = {
      name: item.id,
      description: `[${item.type}] ${item.description}`,
    }

    // Add arguments for commands
    if (item.type === 'command' && item.commandArgumentHint) {
      prompt.arguments = [
        {
          name: 'args',
          description: item.commandArgumentHint,
          required: false,
        },
      ]
    }

    return prompt
  })
}

/**
 * Get a specific prompt by name
 * Returns the plugin content as a prompt message
 */
export async function getPrompt(input: GetPromptInput): Promise<McpPromptResult | null> {
  const { name, arguments: args } = input

  const results = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, name))
    .limit(1)

  if (results.length === 0) {
    return null
  }

  const item = results[0]

  // Build the prompt content
  let promptContent = `## ${item.name}\n\n`
  promptContent += `**Type:** ${item.type}\n`
  promptContent += `**Description:** ${item.description}\n\n`

  if (item.content) {
    promptContent += `---\n\n${item.content}`
  }

  // Append arguments if provided (for commands)
  if (args?.args) {
    promptContent += `\n\n---\n\n**Arguments:** ${args.args}`
  }

  return {
    description: item.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: promptContent,
        },
      },
    ],
  }
}
