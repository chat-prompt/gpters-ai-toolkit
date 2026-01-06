/**
 * User MCP Token Management API
 *
 * Endpoints for users to manage their own MCP API tokens.
 * Users can only view/manage tokens they created.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiErrors, apiSuccess } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { auth } from '@/lib/core/auth'
import { db } from '@/lib/db'
import { mcpTokens, users } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import {
  createToken,
  revokeToken,
  deleteToken,
  type CreateTokenOptions,
} from '@/lib/security/mcp-auth'

const log = createLogger('api:user:mcp-tokens')

// Maximum tokens per user
const MAX_TOKENS_PER_USER = 5

/**
 * Get the database user ID from session email
 * This is needed because session.user.id is the OAuth provider ID,
 * which may differ from the database user ID
 */
async function getDbUserId(email: string): Promise<string | null> {
  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
    return user?.id ?? null
  } catch (error) {
    log.error('Failed to get user ID from email', error)
    return null
  }
}

/**
 * GET /api/user/mcp-tokens
 * List user's own MCP API tokens
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const session = await auth()
  if (!session?.user?.email) {
    return ApiErrors.unauthorized()
  }

  try {
    // Get the database user ID from email
    const userId = await getDbUserId(session.user.email)
    if (!userId) {
      return ApiErrors.notFound('User')
    }

    const tokens = await db
      .select({
        id: mcpTokens.id,
        name: mcpTokens.name,
        description: mcpTokens.description,
        expiresAt: mcpTokens.expiresAt,
        lastUsedAt: mcpTokens.lastUsedAt,
        usageCount: mcpTokens.usageCount,
        rateLimit: mcpTokens.rateLimit,
        isActive: mcpTokens.isActive,
        createdAt: mcpTokens.createdAt,
      })
      .from(mcpTokens)
      .where(eq(mcpTokens.createdBy, userId))
      .orderBy(mcpTokens.createdAt)

    return NextResponse.json({
      tokens,
      count: tokens.length,
      maxTokens: MAX_TOKENS_PER_USER,
    })
  } catch (error) {
    log.error('Failed to list user MCP tokens', error)
    return ApiErrors.internalError('Failed to list tokens')
  }
}

/**
 * POST /api/user/mcp-tokens
 * Generate a new MCP API token for the user
 *
 * Body:
 * - name: string (required) - Human-readable name
 * - description: string (optional) - Longer description
 * - expiresIn: number (optional) - Expiration in days (null = never, max 365)
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const session = await auth()
  if (!session?.user?.email) {
    return ApiErrors.unauthorized()
  }

  try {
    // Get the database user ID from email
    const userId = await getDbUserId(session.user.email)
    if (!userId) {
      return ApiErrors.notFound('User')
    }

    // Check token limit
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mcpTokens)
      .where(eq(mcpTokens.createdBy, userId))

    const currentCount = Number(countResult?.count || 0)
    if (currentCount >= MAX_TOKENS_PER_USER) {
      return ApiErrors.badRequest(
        `Maximum ${MAX_TOKENS_PER_USER} tokens allowed per user. Please delete an existing token first.`
      )
    }

    const body = await request.json()
    const { name, description, expiresIn } = body

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

    // User tokens get a fixed rate limit of 100/min
    const options: CreateTokenOptions = {
      name: name.trim(),
      description: description?.trim(),
      createdBy: userId,
      expiresAt,
      rateLimit: 100,
    }

    const result = await createToken(options)

    log.info('User MCP token created', {
      tokenId: result.id,
      name: result.name,
      userId,
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
    log.error('Failed to create user MCP token', error)
    return ApiErrors.internalError('Failed to create token')
  }
}

/**
 * DELETE /api/user/mcp-tokens?id=xxx
 * Revoke or permanently delete a user's own token
 *
 * Query params:
 * - id: string (required) - Token ID
 * - permanent: boolean (optional) - If true, permanently delete
 */
export async function DELETE(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const session = await auth()
  if (!session?.user?.email) {
    return ApiErrors.unauthorized()
  }

  try {
    // Get the database user ID from email
    const userId = await getDbUserId(session.user.email)
    if (!userId) {
      return ApiErrors.notFound('User')
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const permanent = searchParams.get('permanent') === 'true'

    if (!id) {
      return ApiErrors.badRequest('Token ID is required')
    }

    // Verify ownership
    const [token] = await db
      .select({ id: mcpTokens.id })
      .from(mcpTokens)
      .where(and(eq(mcpTokens.id, id), eq(mcpTokens.createdBy, userId)))

    if (!token) {
      return ApiErrors.notFound('Token')
    }

    let success: boolean

    if (permanent) {
      success = await deleteToken(id)
      if (success) {
        log.info('User MCP token permanently deleted', { tokenId: id, userId })
        return apiSuccess({ message: 'Token permanently deleted', id })
      }
    } else {
      success = await revokeToken(id)
      if (success) {
        log.info('User MCP token revoked', { tokenId: id, userId })
        return apiSuccess({ message: 'Token revoked', id })
      }
    }

    return ApiErrors.internalError('Failed to delete token')
  } catch (error) {
    log.error('Failed to delete user MCP token', error)
    return ApiErrors.internalError('Failed to delete token')
  }
}
