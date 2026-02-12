/**
 * Catalog item upload API route
 *
 * POST: Create or update a catalog item via JSON payload
 * Requires CATALOG_CREATE permission.
 */
import { NextRequest } from 'next/server'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, AgentModel, AgentPermissionMode } from '@/lib/core/types'
import { ApiErrors, validateRequired, apiSuccess, requirePermissionAsync } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { Permissions } from '@/lib/security/rbac'

const log = createLogger('api:upload')

const VALID_TYPES = ['skill', 'agent', 'command', 'guide'] as const

/**
 * Upload API - requires CATALOG_CREATE permission
 */
export async function POST(request: NextRequest) {
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_CREATE, request)
  if (permissionError) return permissionError

  try {
    const body = await request.json()

    const {
      id,
      type,
      name,
      description,
      authorId,
      tags,
      teamTag,
      difficulty,
      pluginId,
      estimatedTime,
      dependencies,
      content,
      readme,
      // Type-specific fields
      allowedTools,
      agentModel,
      agentPermissionMode,
      agentSkills,
      commandArgumentHint,
      commandDisableModelInvocation,
      // MCP integration - defaults to true so uploaded items are immediately available in MCP
      mcpEnabled = true,
    } = body

    const validation = validateRequired(body, ['id', 'type', 'name', 'content'])
    if (!validation.valid) {
      return ApiErrors.badRequest(`Missing required fields: ${validation.missing.join(', ')}`)
    }

    if (!VALID_TYPES.includes(type)) {
      return ApiErrors.badRequest(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`)
    }

    const newItem = {
      id,
      type: type as ItemType,
      name,
      description: description || '',
      authorId: authorId || null,
      tags: tags || [],
      teamTag: (teamTag as TeamTag) || 'general',
      difficulty: difficulty as Difficulty | null,
      pluginId: pluginId || null,
      estimatedTime: estimatedTime || null,
      dependencies: dependencies || [],
      content,
      readme: readme || null,
      // Type-specific fields
      allowedTools: allowedTools || null,
      agentModel: (agentModel as AgentModel) || null,
      agentPermissionMode: (agentPermissionMode as AgentPermissionMode) || null,
      agentSkills: agentSkills || null,
      commandArgumentHint: commandArgumentHint || null,
      commandDisableModelInvocation: commandDisableModelInvocation || false,
      // MCP integration - defaults to true so uploaded items are immediately available in MCP
      mcpEnabled,
    }

    await db.insert(catalogItems).values(newItem)

    return apiSuccess({ success: true, item: newItem }, 201)
  } catch (error) {
    // Handle duplicate ID error
    if (error instanceof Error && error.message.includes('duplicate')) {
      return ApiErrors.conflict('An item with this ID already exists')
    }

    log.error('Upload failed', error)
    return ApiErrors.internalError('Failed to create item')
  }
}
