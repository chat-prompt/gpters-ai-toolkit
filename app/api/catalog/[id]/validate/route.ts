/**
 * Skill Validation API
 *
 * GET /api/catalog/[id]/validate - Validate a catalog item
 * POST /api/catalog/[id]/validate - Validate with custom options
 */

import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/core/logger'
import { db } from '@/lib/db'
import { catalogItems } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  validateCatalogItem,
  generateValidationReport,
  type ValidationOptions,
} from '@/lib/plugin/skill-validator'
import type { CatalogItem } from '@/lib/core/types'

const log = createLogger('api:catalog:validate')

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET - Validate a catalog item by ID
 *
 * Query params:
 *   - strict: Enable strict mode (default: false)
 *   - skipExamples: Skip example validation (default: false)
 *   - format: 'json' | 'report' (default: 'json')
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const { id } = await params
  const { searchParams } = new URL(request.url)

  const options: ValidationOptions = {
    strictMode: searchParams.get('strict') === 'true',
    skipExamples: searchParams.get('skipExamples') === 'true',
    validateFrontmatter: true,
  }

  const format = searchParams.get('format') || 'json'

  try {
    // Fetch the catalog item
    const [item] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.id, id))
      .limit(1)

    if (!item) {
      return NextResponse.json(
        { success: false, error: `Item not found: ${id}` },
        { status: 404 }
      )
    }

    // Set the item type for validation
    options.itemType = item.type

    // Run validation
    const result = validateCatalogItem(item as unknown as CatalogItem, options)

    log.info('Item validated', {
      itemId: id,
      valid: result.valid,
      errors: result.summary.errors,
      warnings: result.summary.warnings,
    })

    // Return as markdown report
    if (format === 'report') {
      const report = generateValidationReport(result)
      return new NextResponse(report, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      })
    }

    // Return JSON response
    return NextResponse.json({
      success: true,
      data: {
        valid: result.valid,
        itemId: result.itemId,
        itemType: result.itemType,
        timestamp: result.timestamp,
        summary: result.summary,
        categories: {
          syntax: {
            passed: result.categories.syntax.passed,
            issueCount: result.categories.syntax.issues.length,
            issues: result.categories.syntax.issues,
          },
          structure: {
            passed: result.categories.structure.passed,
            issueCount: result.categories.structure.issues.length,
            issues: result.categories.structure.issues,
          },
          tools: {
            passed: result.categories.tools.passed,
            issueCount: result.categories.tools.issues.length,
            issues: result.categories.tools.issues,
          },
          examples: {
            passed: result.categories.examples.passed,
            issueCount: result.categories.examples.issues.length,
            issues: result.categories.examples.issues,
          },
        },
        examplesFound: result.parsedExamples.length,
        exampleValidations: result.exampleValidations,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Validation failed', { itemId: id, error: message })

    return NextResponse.json(
      { success: false, error: 'Failed to validate item' },
      { status: 500 }
    )
  }
}

/**
 * POST - Validate content directly (for editor preview)
 *
 * Body:
 *   - content: string (markdown content to validate)
 *   - type?: ItemType (default: 'skill')
 *   - name?: string
 *   - description?: string
 *   - allowedTools?: string
 *   - options?: ValidationOptions
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const { id } = await params

  try {
    const body = await request.json()
    const {
      content,
      type = 'skill',
      name,
      description,
      allowedTools,
      options: customOptions = {},
    } = body

    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      )
    }

    const item: Partial<CatalogItem> = {
      id,
      type,
      name: name || id,
      description: description || '',
      content,
      allowedTools,
      authorName: 'preview',
      tags: [],
      likes: 0,
    }

    const options: ValidationOptions = {
      itemType: type,
      validateFrontmatter: true,
      ...customOptions,
    }

    const result = validateCatalogItem(item, options)

    log.info('Content validated', {
      itemId: id,
      type,
      valid: result.valid,
      errors: result.summary.errors,
    })

    return NextResponse.json({
      success: true,
      data: {
        valid: result.valid,
        itemId: result.itemId,
        itemType: result.itemType,
        timestamp: result.timestamp,
        summary: result.summary,
        categories: result.categories,
        parsedExamples: result.parsedExamples,
        parsedFrontmatter: result.parsedFrontmatter,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Content validation failed', { itemId: id, error: message })

    return NextResponse.json(
      { success: false, error: 'Failed to validate content' },
      { status: 500 }
    )
  }
}
