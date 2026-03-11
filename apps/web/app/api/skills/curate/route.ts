/**
 * GET /api/skills/curate — Curated skill categories endpoint (DEV-3063)
 *
 * Server-to-server REST endpoint for retrieving curated skill lists
 * by category. Authenticated via service token (RONA_SERVICE_TOKEN).
 */

import { type NextRequest } from 'next/server'
import { after } from 'next/server'
import { validateServiceToken } from '@/lib/security/service-token'
import { getCuratedSkills, listCuratedCategories } from '@/lib/mcp/skills-curate'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { ApiErrors, apiSuccess } from '@/lib/utils/api-utils'
import { logMcpRequest } from '@/lib/security/mcp-audit'
import { createLogger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

const log = createLogger('api-skills-curate')

export async function GET(request: NextRequest) {
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

  // 3. Parse and validate query parameter
  const category = request.nextUrl.searchParams.get('category')

  if (!category || category.trim().length === 0) {
    return ApiErrors.badRequest(
      'Missing required query parameter: category. ' +
      `Available categories: ${listCuratedCategories().join(', ')}`
    )
  }

  try {
    // 4. Fetch curated skills
    const result = await getCuratedSkills(category.trim())

    if (!result) {
      return ApiErrors.notFound(
        `Category "${category}" not found. ` +
        `Available categories: ${listCuratedCategories().join(', ')}`
      )
    }

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
          method: 'GET /api/skills/curate',
          tool: 'curated_skills',
          isAuthenticated: true,
          ipHash,
          userAgent: request.headers.get('user-agent') || undefined,
          clientType: auth.serviceName,
          clientName: auth.serviceName,
          requestParams: { category },
          responseStatus: 'success',
          responseTime,
          referralSource: 'curate',
        })
      } catch (err) {
        log.error('Failed to log audit entry', err)
      }
    })

    return apiSuccess(result)
  } catch (error) {
    log.error('Curated skills fetch failed', error)
    return ApiErrors.internalError('Curated skills fetch failed')
  }
}
