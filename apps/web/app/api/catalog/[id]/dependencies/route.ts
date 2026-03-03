/**
 * Catalog Item Dependencies API
 *
 * GET /api/catalog/[id]/dependencies - Get resolved dependencies
 * POST /api/catalog/[id]/dependencies/validate - Validate dependencies
 */

import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import {
  resolveAllDependencies,
  validateDependencies,
  getDependencyTree,
  generateMcpConfig,
  type ResolveOptions,
} from '@/lib/plugin/dependency-resolver'

const log = createLogger('api:catalog:dependencies')

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET - Resolve and return all dependencies for a catalog item
 *
 * Query params:
 *   - maxDepth: Maximum depth to traverse (default: 10)
 *   - includeOptional: Include optional dependencies (default: false)
 *   - format: 'json' | 'tree' | 'mcp-config' (default: 'json')
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const { id } = await params
  const { searchParams } = new URL(request.url)

  const options: ResolveOptions = {
    maxDepth: parseInt(searchParams.get('maxDepth') || '10', 10),
    includeOptional: searchParams.get('includeOptional') === 'true',
  }

  const format = searchParams.get('format') || 'json'

  try {
    const result = await resolveAllDependencies(id, options)

    // Format: tree - return human-readable dependency tree
    if (format === 'tree') {
      const tree = await getDependencyTree(id)
      return new NextResponse(tree, {
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Format: mcp-config - return MCP server configuration
    if (format === 'mcp-config') {
      const config = generateMcpConfig(result.mcpServers)
      return NextResponse.json({
        success: true,
        config,
      })
    }

    // Default: full JSON response
    log.info('Dependencies resolved', { itemId: id, count: result.totalCount })

    return NextResponse.json({
      success: true,
      data: {
        rootId: result.rootId,
        totalCount: result.totalCount,
        maxDepth: result.maxDepth,
        hasCircularDependencies: result.circularPaths.length > 0,
        summary: {
          mcp: result.mcpServers.length,
          skills: result.catalogDependencies.filter((d) => d.type === 'skill').length,
          agents: result.catalogDependencies.filter((d) => d.type === 'agent').length,
          unresolved: result.unresolved.length,
        },
        dependencies: result.dependencies.map((dep) => ({
          type: dep.type,
          id: dep.id,
          label: dep.label,
          direct: dep.direct,
          depth: dep.depth,
          available: dep.available,
          requiredBy: dep.requiredBy,
          configUrl: dep.configUrl,
          catalogItem: dep.catalogItem
            ? {
                id: dep.catalogItem.id,
                name: dep.catalogItem.name,
                type: dep.catalogItem.type,
              }
            : undefined,
        })),
        mcpServers: result.mcpServers,
        catalogDependencies: result.catalogDependencies,
        circularPaths: result.circularPaths,
        installOrder: result.installOrder,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Failed to resolve dependencies', { itemId: id, error: message })

    if (message.includes('not found')) {
      return ApiErrors.notFound(message)
    }

    return ApiErrors.internalError()
  }
}

/**
 * POST - Validate dependencies for conflicts and issues
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  const { id } = await params

  try {
    const validation = await validateDependencies(id)

    log.info('Dependencies validated', {
      itemId: id,
      valid: validation.valid,
      conflicts: validation.conflicts.length,
    })

    return NextResponse.json({
      success: true,
      data: {
        itemId: id,
        valid: validation.valid,
        conflicts: validation.conflicts,
        summary: {
          circular: validation.conflicts.filter((c) => c.type === 'circular').length,
          missing: validation.conflicts.filter((c) => c.type === 'missing').length,
          versionMismatch: validation.conflicts.filter((c) => c.type === 'version_mismatch').length,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Failed to validate dependencies', { itemId: id, error: message })

    if (message.includes('not found')) {
      return ApiErrors.notFound(message)
    }

    return ApiErrors.internalError()
  }
}
