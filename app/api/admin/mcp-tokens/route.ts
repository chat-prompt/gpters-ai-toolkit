/**
 * MCP Token Management API
 *
 * Admin endpoints for managing MCP API tokens.
 * Requires ADMIN_SETTINGS permission.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiErrors, apiSuccess } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { requirePermission, Permissions } from '@/lib/security/rbac'
import { auth } from '@/lib/core/auth'
import {
  createToken,
  listTokens,
  revokeToken,
  deleteToken,
  reactivateToken,
  updateToken,
  type CreateTokenOptions,
} from '@/lib/security/mcp-auth'

const log = createLogger('api:admin:mcp-tokens')

/**
 * GET /api/admin/mcp-tokens
 * List all MCP API tokens (admin only)
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermission(Permissions.ADMIN_SETTINGS)
  if (permissionError) return permissionError

  try {
    const tokens = await listTokens()

    return NextResponse.json({
      tokens,
      count: tokens.length,
    })
  } catch (error) {
    log.error('Failed to list MCP tokens', error)
    return ApiErrors.internalError('Failed to list tokens')
  }
}

/**
 * POST /api/admin/mcp-tokens
 * Generate a new MCP API token
 *
 * Body:
 * - name: string (required) - Human-readable name
 * - description: string (optional) - Longer description
 * - expiresIn: number (optional) - Expiration in days (null = never)
 * - rateLimit: number (optional) - Requests per minute (default: 100)
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermission(Permissions.ADMIN_SETTINGS)
  if (permissionError) return permissionError

  try {
    const body = await request.json()
    const { name, description, expiresIn, rateLimit } = body

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return ApiErrors.badRequest('Token name is required')
    }

    if (name.length > 100) {
      return ApiErrors.badRequest('Token name must be 100 characters or less')
    }

    if (description && typeof description !== 'string') {
      return ApiErrors.badRequest('Description must be a string')
    }

    if (description && description.length > 500) {
      return ApiErrors.badRequest('Description must be 500 characters or less')
    }

    // Validate expiresIn
    let expiresAt: Date | undefined
    if (expiresIn !== undefined && expiresIn !== null) {
      if (typeof expiresIn !== 'number' || expiresIn < 1 || expiresIn > 365) {
        return ApiErrors.badRequest('expiresIn must be a number between 1 and 365 days')
      }
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiresIn)
    }

    // Validate rateLimit
    if (rateLimit !== undefined && rateLimit !== null) {
      if (typeof rateLimit !== 'number' || rateLimit < 1 || rateLimit > 10000) {
        return ApiErrors.badRequest('rateLimit must be a number between 1 and 10000')
      }
    }

    // Get current user
    const session = await auth()
    const createdBy = session?.user?.id

    const options: CreateTokenOptions = {
      name: name.trim(),
      description: description?.trim(),
      createdBy,
      expiresAt,
      rateLimit: rateLimit ?? 100,
    }

    const result = await createToken(options)

    log.info('MCP token created', {
      tokenId: result.id,
      name: result.name,
      createdBy,
    })

    // Return the token - this is the ONLY time the raw token is available
    return NextResponse.json(
      {
        message: 'Token created successfully. Copy the token now - it will not be shown again.',
        token: result.token,
        id: result.id,
        name: result.name,
        description: result.description,
        expiresAt: result.expiresAt,
        rateLimit: result.rateLimit,
        createdAt: result.createdAt,
      },
      { status: 201 }
    )
  } catch (error) {
    log.error('Failed to create MCP token', error)
    return ApiErrors.internalError('Failed to create token')
  }
}

/**
 * DELETE /api/admin/mcp-tokens?id=xxx
 * Revoke a token (soft delete) or permanently delete
 *
 * Query params:
 * - id: string (required) - Token ID
 * - permanent: boolean (optional) - If true, permanently delete
 */
export async function DELETE(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermission(Permissions.ADMIN_SETTINGS)
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const permanent = searchParams.get('permanent') === 'true'

    if (!id) {
      return ApiErrors.badRequest('Token ID is required')
    }

    let success: boolean

    if (permanent) {
      success = await deleteToken(id)
      if (success) {
        log.info('MCP token permanently deleted', { tokenId: id })
        return apiSuccess({ message: 'Token permanently deleted', id })
      }
    } else {
      success = await revokeToken(id)
      if (success) {
        log.info('MCP token revoked', { tokenId: id })
        return apiSuccess({ message: 'Token revoked', id })
      }
    }

    return ApiErrors.notFound('Token')
  } catch (error) {
    log.error('Failed to delete MCP token', error)
    return ApiErrors.internalError('Failed to delete token')
  }
}

/**
 * PATCH /api/admin/mcp-tokens
 * Update token settings or reactivate a revoked token
 *
 * Body:
 * - id: string (required) - Token ID
 * - action: 'reactivate' | 'update' (required)
 * - name: string (optional, for update)
 * - description: string (optional, for update)
 * - expiresIn: number | null (optional, for update) - Days from now, or null for never
 * - rateLimit: number (optional, for update)
 */
export async function PATCH(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermission(Permissions.ADMIN_SETTINGS)
  if (permissionError) return permissionError

  try {
    const body = await request.json()
    const { id, action, name, description, expiresIn, rateLimit } = body

    if (!id || typeof id !== 'string') {
      return ApiErrors.badRequest('Token ID is required')
    }

    if (!action || !['reactivate', 'update'].includes(action)) {
      return ApiErrors.badRequest('Action must be "reactivate" or "update"')
    }

    if (action === 'reactivate') {
      const success = await reactivateToken(id)
      if (success) {
        log.info('MCP token reactivated', { tokenId: id })
        return apiSuccess({ message: 'Token reactivated', id })
      }
      return ApiErrors.badRequest('Token not found or already active')
    }

    // action === 'update'
    const updates: Parameters<typeof updateToken>[1] = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return ApiErrors.badRequest('Name must be a non-empty string')
      }
      if (name.length > 100) {
        return ApiErrors.badRequest('Name must be 100 characters or less')
      }
      updates.name = name.trim()
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return ApiErrors.badRequest('Description must be a string or null')
      }
      updates.description = description?.trim() ?? undefined
    }

    if (expiresIn !== undefined) {
      if (expiresIn === null) {
        updates.expiresAt = null
      } else if (typeof expiresIn === 'number' && expiresIn >= 1 && expiresIn <= 365) {
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + expiresIn)
        updates.expiresAt = expiresAt
      } else {
        return ApiErrors.badRequest('expiresIn must be null or a number between 1 and 365')
      }
    }

    if (rateLimit !== undefined) {
      if (typeof rateLimit !== 'number' || rateLimit < 1 || rateLimit > 10000) {
        return ApiErrors.badRequest('rateLimit must be a number between 1 and 10000')
      }
      updates.rateLimit = rateLimit
    }

    if (Object.keys(updates).length === 0) {
      return ApiErrors.badRequest('No updates provided')
    }

    const success = await updateToken(id, updates)
    if (success) {
      log.info('MCP token updated', { tokenId: id, updates: Object.keys(updates) })
      return apiSuccess({ message: 'Token updated', id })
    }

    return ApiErrors.notFound('Token')
  } catch (error) {
    log.error('Failed to update MCP token', error)
    return ApiErrors.internalError('Failed to update token')
  }
}
