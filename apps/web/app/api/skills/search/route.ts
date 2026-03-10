/**
 * POST /api/skills/search — Exercise-aware skill search endpoint (DEV-3055)
 *
 * Server-to-server REST endpoint for Rona to search skills, MCP servers,
 * and CLI tools relevant to exercise generation. Authenticated via
 * service token (RONA_SERVICE_TOKEN).
 */

import { type NextRequest } from 'next/server'
import { after } from 'next/server'
import { validateServiceToken } from '@/lib/security/service-token'
import { searchSkillsForExercise, type SkillSearchRequest } from '@/lib/mcp/skills-search'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { ApiErrors, apiSuccess, parseJsonBody } from '@/lib/utils/api-utils'
import { logMcpRequest } from '@/lib/security/mcp-audit'
import { createLogger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

const log = createLogger('api-skills-search')

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // 1. Service token authentication
  const auth = validateServiceToken(request)
  if (auth.error) return auth.error

  // 2. Rate limiting (search preset: 30 req/min per service)
  const rateLimitError = withRateLimit(request, {
    ...RateLimitPresets.search,
    identifier: () => `service:${auth.serviceName}`,
  })
  if (rateLimitError) return rateLimitError

  // 3. Parse and validate request body
  const body = await parseJsonBody<SkillSearchRequest>(request)
  if (!body) {
    return ApiErrors.badRequest('Invalid JSON in request body')
  }

  if (!body.topic || typeof body.topic !== 'string' || body.topic.trim().length === 0) {
    return ApiErrors.badRequest('Missing or empty required field: topic')
  }

  if (body.techStack && !Array.isArray(body.techStack)) {
    return ApiErrors.badRequest('techStack must be an array of strings')
  }

  if (body.level && !['beginner', 'intermediate', 'advanced'].includes(body.level)) {
    return ApiErrors.badRequest('level must be one of: beginner, intermediate, advanced')
  }

  if (body.limit !== undefined && (typeof body.limit !== 'number' || body.limit < 1 || body.limit > 10)) {
    return ApiErrors.badRequest('limit must be a number between 1 and 10')
  }

  try {
    // 4. Execute search
    const result = await searchSkillsForExercise({
      topic: body.topic.trim(),
      techStack: body.techStack?.map(t => t.trim()).filter(Boolean),
      level: body.level,
      platform: body.platform,
      limit: body.limit,
    })

    const responseTime = Date.now() - startTime

    // 5. Audit logging (fire-and-forget)
    after(async () => {
      try {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown'
        const encoder = new TextEncoder()
        const data = encoder.encode(clientIp)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const ipHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')

        await logMcpRequest({
          method: 'POST /api/skills/search',
          tool: 'exercise_skill_search',
          isAuthenticated: true,
          ipHash,
          userAgent: request.headers.get('user-agent') || undefined,
          clientType: auth.serviceName,
          clientName: auth.serviceName,
          requestParams: {
            topic: body.topic.slice(0, 200),
            techStack: body.techStack,
            level: body.level,
            platform: body.platform,
            limit: body.limit,
          },
          responseStatus: 'success',
          responseTime,
          searchResults: result.skills.map((s, i) => ({
            itemId: s.id,
            rank: i + 1,
            score: s.score,
          })),
          referralSource: 'search',
        })
      } catch (err) {
        log.error('Failed to log audit entry', err)
      }
    })

    return apiSuccess(result)
  } catch (error) {
    log.error('Skill search failed', error)
    return ApiErrors.internalError('Skill search failed')
  }
}
