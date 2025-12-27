import { NextRequest } from 'next/server'
import { ApiErrors, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'
import { getItemById } from '@/lib/catalog'
import {
  auditCatalogItem,
  auditContent,
  type SecurityAuditResult,
  type SecurityIssue,
} from '@/lib/security-audit'

const log = createLogger('api:security-audit')

/**
 * POST /api/admin/security-audit
 * Run security audit on a catalog item or raw content
 *
 * Body options:
 * - { itemId: string } - Audit existing catalog item by ID
 * - { content: string, hookCommand?: string } - Audit raw content directly
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itemId, content, hookCommand } = body

    // Validate input - need either itemId or content
    if (!itemId && !content) {
      return ApiErrors.badRequest('Either itemId or content is required')
    }

    let result: SecurityAuditResult

    if (itemId) {
      // Audit existing catalog item
      const item = await getItemById(itemId)

      if (!item) {
        return ApiErrors.notFound('Catalog item')
      }

      log.info('Running security audit on catalog item', { itemId })
      result = auditCatalogItem(item)
    } else {
      // Audit raw content (for preview/validation before save)
      log.info('Running security audit on raw content')

      const issues: SecurityIssue[] = []

      // Audit main content
      if (content) {
        issues.push(...auditContent(content, 'content'))
      }

      // Audit hook command if provided
      if (hookCommand) {
        issues.push(...auditContent(hookCommand, 'hookCommand'))
      }

      // Build result structure
      const summary = {
        total: issues.length,
        critical: issues.filter((i) => i.riskLevel === 'critical').length,
        high: issues.filter((i) => i.riskLevel === 'high').length,
        medium: issues.filter((i) => i.riskLevel === 'medium').length,
        low: issues.filter((i) => i.riskLevel === 'low').length,
      }

      // Determine overall risk
      let overallRisk: SecurityAuditResult['overallRisk'] = 'low'
      if (summary.critical > 0) overallRisk = 'critical'
      else if (summary.high > 0) overallRisk = 'high'
      else if (summary.medium > 0) overallRisk = 'medium'

      result = {
        itemId: 'preview',
        itemName: 'Content Preview',
        itemType: 'unknown',
        auditedAt: new Date().toISOString(),
        overallRisk,
        issues,
        summary,
        passed: summary.critical === 0 && summary.high === 0,
      }
    }

    return apiSuccess(result)
  } catch (error) {
    log.error('Security audit failed', error)
    return ApiErrors.internalError('Failed to run security audit')
  }
}

/**
 * GET /api/admin/security-audit
 * Get audit results for a specific item or list recent audits
 *
 * Query params:
 * - itemId: string - Get audit for specific item (runs new audit)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('itemId')

    if (itemId) {
      // Get audit for specific item
      const item = await getItemById(itemId)

      if (!item) {
        return ApiErrors.notFound('Catalog item')
      }

      log.info('Running security audit via GET', { itemId })
      const result = auditCatalogItem(item)
      return apiSuccess(result)
    }

    // Return available patterns info (useful for documentation)
    const { getSecurityPatterns } = await import('@/lib/security-audit')
    const patterns = getSecurityPatterns()

    return apiSuccess({
      message: 'Security audit API',
      usage: {
        post: 'POST with { itemId: string } or { content: string }',
        get: 'GET with ?itemId=xxx to audit a specific item',
      },
      availablePatterns: patterns.length,
      patterns: patterns.map((p) => ({
        id: p.id,
        category: p.category,
        riskLevel: p.riskLevel,
        title: p.title,
      })),
    })
  } catch (error) {
    log.error('Security audit GET failed', error)
    return ApiErrors.internalError('Failed to get security audit info')
  }
}

/**
 * Bulk audit multiple items (for admin dashboard)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { itemIds } = body as { itemIds?: string[] }

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return ApiErrors.badRequest('itemIds array is required')
    }

    // Limit to prevent abuse
    if (itemIds.length > 50) {
      return ApiErrors.badRequest('Maximum 50 items per bulk audit')
    }

    log.info('Running bulk security audit', { count: itemIds.length })

    const results: SecurityAuditResult[] = []
    const errors: { itemId: string; error: string }[] = []

    for (const itemId of itemIds) {
      try {
        const item = await getItemById(itemId)
        if (item) {
          results.push(auditCatalogItem(item))
        } else {
          errors.push({ itemId, error: 'Item not found' })
        }
      } catch (err) {
        errors.push({
          itemId,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    // Summary statistics
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      errors: errors.length,
      bySeverity: {
        critical: results.filter((r) => r.overallRisk === 'critical').length,
        high: results.filter((r) => r.overallRisk === 'high').length,
        medium: results.filter((r) => r.overallRisk === 'medium').length,
        low: results.filter((r) => r.overallRisk === 'low').length,
      },
    }

    return apiSuccess({
      summary,
      results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    log.error('Bulk security audit failed', error)
    return ApiErrors.internalError('Failed to run bulk security audit')
  }
}
