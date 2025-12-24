import { NextRequest, NextResponse } from 'next/server'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, AgentModel, AgentPermissionMode } from '@/lib/types'

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

    if (!id || !type || !name || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: id, type, name, content' },
        { status: 400 }
      )
    }

    const validTypes = ['skill', 'agent', 'prompt', 'command', 'guide']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
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

    return NextResponse.json(
      { success: true, item: newItem },
      { status: 201 }
    )
  } catch (error) {
    // Handle duplicate ID error
    if (error instanceof Error && error.message.includes('duplicate')) {
      return NextResponse.json(
        { error: 'An item with this ID already exists' },
        { status: 409 }
      )
    }

    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    )
  }
}
