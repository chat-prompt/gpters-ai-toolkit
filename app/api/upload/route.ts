import { NextRequest } from 'next/server'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, AgentModel, AgentPermissionMode } from '@/lib/types'
import { ApiErrors, validateRequired, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:upload')

const VALID_TYPES = ['skill', 'agent', 'command', 'guide'] as const

/**
 * Public upload API - no authentication required
 * For internal team use with trust-based access
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      id,
      type,
      name,
      description,
      author,
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
      author: author || 'anonymous',
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
