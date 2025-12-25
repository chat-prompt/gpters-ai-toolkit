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
  PluginSummary,
  PluginContent,
  SearchResult,
  ListResult,
  McpToolResponse,
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
