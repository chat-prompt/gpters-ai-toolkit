/**
 * Batch Skill Validation API
 *
 * POST /api/catalog/validate - Validate multiple items or content
 */

import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/core/logger'
import { db } from '@/lib/db'
import { catalogItems } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import {
  validateCatalogItem,
  validateSkillContent,
  getValidTools,
  parseAllowedTools,
  type ValidationOptions,
  type SkillValidationResult,
} from '@/lib/plugin/skill-validator'
import type { CatalogItem, ItemType } from '@/lib/core/types'

const log = createLogger('api:catalog:validate:batch')

interface BatchValidationItem {
  id: string
  valid: boolean
  errors: number
  warnings: number
}

/**
 * POST - Batch validate multiple items or content
 *
 * Body options:
 *
 * 1. Validate by IDs:
 *    { "ids": ["skill-1", "skill-2"] }
 *
 * 2. Validate by type (all items of a type):
 *    { "type": "skill" }
 *
 * 3. Validate content directly:
 *    { "content": "# My Skill\n...", "type": "skill" }
 *
 * 4. Validate tools list:
 *    { "validateTools": "Read, Write, FakeCommand" }
 *
 * 5. Get valid tools list:
 *    { "getValidTools": true }
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const body = await request.json()

    // Option 5: Return list of valid tools
    if (body.getValidTools) {
      return NextResponse.json({
        success: true,
        data: {
          tools: getValidTools(),
        },
      })
    }

    // Option 4: Validate tools list
    if (body.validateTools) {
      const { valid, invalid } = parseAllowedTools(body.validateTools)
      return NextResponse.json({
        success: true,
        data: {
          allValid: invalid.length === 0,
          validTools: valid,
          invalidTools: invalid,
          availableTools: getValidTools(),
        },
      })
    }

    // Option 3: Validate content directly
    if (body.content) {
      const type: ItemType = body.type || 'skill'
      const options: ValidationOptions = {
        itemType: type,
        strictMode: body.strict === true,
        skipExamples: body.skipExamples === true,
      }

      const result = validateSkillContent(body.content, options)

      return NextResponse.json({
        success: true,
        data: {
          valid: result.valid,
          summary: result.summary,
          categories: result.categories,
          parsedExamples: result.parsedExamples,
          parsedFrontmatter: result.parsedFrontmatter,
        },
      })
    }

    // Option 1 & 2: Validate by IDs or type
    let items: CatalogItem[] = []

    if (body.ids && Array.isArray(body.ids)) {
      // Validate specific items by ID
      items = await db
        .select()
        .from(catalogItems)
        .where(inArray(catalogItems.id, body.ids)) as unknown as CatalogItem[]
    } else if (body.type) {
      // Validate all items of a type (limit to 100)
      items = await db
        .select()
        .from(catalogItems)
        .where(inArray(catalogItems.type, [body.type]))
        .limit(100) as unknown as CatalogItem[]
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: ids, type, content, validateTools, or getValidTools',
        },
        { status: 400 }
      )
    }

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          total: 0,
          valid: 0,
          invalid: 0,
          items: [],
        },
      })
    }

    // Validate all items
    const options: ValidationOptions = {
      strictMode: body.strict === true,
      skipExamples: body.skipExamples !== false, // Skip by default for batch
    }

    const results: BatchValidationItem[] = []
    const fullResults: SkillValidationResult[] = []
    let validCount = 0

    for (const item of items) {
      const result = validateCatalogItem(item, {
        ...options,
        itemType: item.type,
      })

      results.push({
        id: item.id,
        valid: result.valid,
        errors: result.summary.errors,
        warnings: result.summary.warnings,
      })

      if (body.includeFullResults) {
        fullResults.push(result)
      }

      if (result.valid) {
        validCount++
      }
    }

    log.info('Batch validation complete', {
      total: items.length,
      valid: validCount,
      invalid: items.length - validCount,
    })

    return NextResponse.json({
      success: true,
      data: {
        total: items.length,
        valid: validCount,
        invalid: items.length - validCount,
        items: results,
        ...(body.includeFullResults && { fullResults }),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Batch validation failed', { error: message })

    return NextResponse.json(
      { success: false, error: 'Failed to validate items' },
      { status: 500 }
    )
  }
}
