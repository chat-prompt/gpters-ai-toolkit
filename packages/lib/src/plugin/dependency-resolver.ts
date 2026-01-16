/**
 * Skill Dependency Resolver
 *
 * Provides automatic dependency resolution for skills:
 * - Transitive dependency resolution
 * - MCP server dependency detection
 * - Dependency chain installation ordering
 * - Conflict detection
 */

import { db, catalogItems } from '@gpters/db'
import { eq } from 'drizzle-orm'
import { parseDependency, MCP_SERVERS, type Dependency, type CatalogItemSummary } from '../core/types'
import { createLogger } from '../core/logger'

const log = createLogger('dependency-resolver')

/**
 * Resolved dependency with full context
 */
export interface ResolvedDependency extends Dependency {
  /** Whether this is a direct dependency (vs transitive) */
  direct: boolean
  /** Depth in dependency tree (0 = root's direct dependency) */
  depth: number
  /** The item that requires this dependency */
  requiredBy: string[]
  /** Full catalog item if resolved from database */
  catalogItem?: CatalogItemSummary
  /** Whether this dependency is available in catalog */
  available: boolean
  /** Installation status (for skill/agent types) */
  installed?: boolean
  /** For MCP servers, configuration guide URL */
  configUrl?: string
}

/**
 * Dependency resolution result
 */
export interface DependencyResolutionResult {
  /** The root item ID */
  rootId: string
  /** All resolved dependencies (including transitive) */
  dependencies: ResolvedDependency[]
  /** Just the MCP server dependencies */
  mcpServers: ResolvedDependency[]
  /** Just the skill/agent dependencies */
  catalogDependencies: ResolvedDependency[]
  /** Dependencies that couldn't be resolved */
  unresolved: ResolvedDependency[]
  /** Circular dependency paths found */
  circularPaths: string[][]
  /** Installation order (topologically sorted) */
  installOrder: string[]
  /** Total dependency count */
  totalCount: number
  /** Max depth of dependency tree */
  maxDepth: number
}

/**
 * Dependency conflict information
 */
export interface DependencyConflict {
  dependencyId: string
  type: 'circular' | 'missing' | 'version_mismatch'
  message: string
  involvedItems: string[]
}

/**
 * Options for dependency resolution
 */
export interface ResolveOptions {
  /** Maximum depth to traverse (default: 10) */
  maxDepth?: number
  /** Include optional dependencies */
  includeOptional?: boolean
  /** Skip already installed dependencies */
  skipInstalled?: boolean
}

/**
 * MCP Server configuration URLs
 */
const MCP_CONFIG_URLS: Record<string, string> = {
  github: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  filesystem: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  postgresql: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
  sqlite: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
  slack: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
  notion: 'https://github.com/makenotion/notion-mcp-server',
  linear: 'https://github.com/jerhadf/linear-mcp-server',
  puppeteer: 'https://github.com/anthropics/claude-code/tree/main/mcp-servers/puppeteer',
  brave: 'https://github.com/anthropics/claude-code/tree/main/mcp-servers/brave-search',
}

/**
 * Resolve all dependencies for a catalog item
 *
 * @param itemId - The catalog item ID to resolve dependencies for
 * @param options - Resolution options
 * @returns Full dependency resolution result
 */
export async function resolveAllDependencies(
  itemId: string,
  options: ResolveOptions = {}
): Promise<DependencyResolutionResult> {
  const { maxDepth = 10, includeOptional = false } = options

  log.info('Resolving dependencies', { itemId, maxDepth, includeOptional })

  // Get the root item
  const [rootItem] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, itemId))
    .limit(1)

  if (!rootItem) {
    throw new Error(`Item not found: ${itemId}`)
  }

  const allDependencies: Map<string, ResolvedDependency> = new Map()
  const circularPaths: string[][] = []
  const visited = new Set<string>()
  const path: string[] = []

  // Recursive dependency resolution
  async function traverse(
    dependencies: string[],
    parentId: string,
    depth: number
  ): Promise<void> {
    if (depth > maxDepth) {
      log.warn('Max depth exceeded', { parentId, depth })
      return
    }

    for (const depString of dependencies) {
      const parsed = parseDependency(depString)
      const depKey = `${parsed.type}:${parsed.id}`

      // Check for circular dependency
      if (path.includes(depKey)) {
        const cyclePath = [...path.slice(path.indexOf(depKey)), depKey]
        circularPaths.push(cyclePath)
        log.warn('Circular dependency detected', { cyclePath })
        continue
      }

      // Update existing dependency or create new one
      if (allDependencies.has(depKey)) {
        const existing = allDependencies.get(depKey)!
        existing.requiredBy.push(parentId)
        existing.direct = existing.direct || depth === 0
        continue
      }

      // Create resolved dependency
      const resolved: ResolvedDependency = {
        ...parsed,
        direct: depth === 0,
        depth,
        requiredBy: [parentId],
        available: false,
        configUrl: parsed.type === 'mcp' ? MCP_CONFIG_URLS[parsed.id] : undefined,
      }

      // For MCP servers, check if it's a known server
      if (parsed.type === 'mcp') {
        resolved.available = !!MCP_SERVERS[parsed.id]
        resolved.label = MCP_SERVERS[parsed.id]?.label || `${parsed.id} MCP Server`
      }

      // For skill/agent dependencies, look them up in the catalog
      if (parsed.type === 'skill' || parsed.type === 'agent') {
        if (!visited.has(parsed.id)) {
          visited.add(parsed.id)

          const [catalogItem] = await db
            .select()
            .from(catalogItems)
            .where(eq(catalogItems.id, parsed.id))
            .limit(1)

          if (catalogItem) {
            resolved.available = true
            resolved.catalogItem = catalogItem as unknown as CatalogItemSummary
            resolved.label = catalogItem.name

            // Recursively resolve nested dependencies
            if (catalogItem.dependencies && catalogItem.dependencies.length > 0) {
              path.push(depKey)
              await traverse(catalogItem.dependencies, parsed.id, depth + 1)
              path.pop()
            }
          }
        }
      }

      allDependencies.set(depKey, resolved)
    }
  }

  // Start resolution from root item's dependencies
  if (rootItem.dependencies && rootItem.dependencies.length > 0) {
    await traverse(rootItem.dependencies, itemId, 0)
  }

  // Convert to arrays and categorize
  const dependencies = Array.from(allDependencies.values())
  const mcpServers = dependencies.filter((d) => d.type === 'mcp')
  const catalogDependencies = dependencies.filter((d) => d.type === 'skill' || d.type === 'agent')
  const unresolved = dependencies.filter((d) => !d.available)

  // Calculate installation order (topological sort)
  const installOrder = computeInstallOrder(catalogDependencies)

  const result: DependencyResolutionResult = {
    rootId: itemId,
    dependencies,
    mcpServers,
    catalogDependencies,
    unresolved,
    circularPaths,
    installOrder,
    totalCount: dependencies.length,
    maxDepth: Math.max(0, ...dependencies.map((d) => d.depth)),
  }

  log.info('Dependency resolution complete', {
    rootId: itemId,
    total: result.totalCount,
    mcp: mcpServers.length,
    catalog: catalogDependencies.length,
    unresolved: unresolved.length,
    circular: circularPaths.length,
  })

  return result
}

/**
 * Get only missing/uninstalled dependencies
 */
export async function getMissingDependencies(
  itemId: string
): Promise<ResolvedDependency[]> {
  const result = await resolveAllDependencies(itemId)
  return result.dependencies.filter((d) => !d.available || !d.installed)
}

/**
 * Validate dependencies and return any conflicts
 */
export async function validateDependencies(
  itemId: string
): Promise<{
  valid: boolean
  conflicts: DependencyConflict[]
}> {
  const result = await resolveAllDependencies(itemId)
  const conflicts: DependencyConflict[] = []

  // Check for circular dependencies
  for (const cycle of result.circularPaths) {
    conflicts.push({
      dependencyId: cycle[0],
      type: 'circular',
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      involvedItems: cycle,
    })
  }

  // Check for missing dependencies
  for (const dep of result.unresolved) {
    conflicts.push({
      dependencyId: `${dep.type}:${dep.id}`,
      type: 'missing',
      message: `Dependency not found: ${dep.label} (${dep.type}:${dep.id})`,
      involvedItems: dep.requiredBy,
    })
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  }
}

/**
 * Compute topological installation order
 */
function computeInstallOrder(dependencies: ResolvedDependency[]): string[] {
  const graph = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()

  // Build adjacency list
  for (const dep of dependencies) {
    const id = `${dep.type}:${dep.id}`
    if (!graph.has(id)) {
      graph.set(id, new Set())
      inDegree.set(id, 0)
    }
  }

  // Add edges based on nested dependencies
  for (const dep of dependencies) {
    const id = `${dep.type}:${dep.id}`
    if (dep.catalogItem?.dependencies) {
      for (const nestedDep of dep.catalogItem.dependencies) {
        if (graph.has(nestedDep)) {
          graph.get(nestedDep)!.add(id)
          inDegree.set(id, (inDegree.get(id) || 0) + 1)
        }
      }
    }
  }

  // Kahn's algorithm for topological sort
  const queue: string[] = []
  const result: string[] = []

  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)

    for (const neighbor of graph.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  return result
}

/**
 * Get dependency tree as a human-readable string
 */
export async function getDependencyTree(itemId: string): Promise<string> {
  const result = await resolveAllDependencies(itemId)
  const lines: string[] = []

  // Group by depth for tree display
  const directDeps = result.dependencies.filter((d) => d.direct)

  function buildTree(dep: ResolvedDependency, prefix: string, isLast: boolean): void {
    const connector = isLast ? '└── ' : '├── '
    const statusIcon = dep.available ? '✓' : '✗'
    const typeLabel = dep.type === 'mcp' ? '(MCP)' : dep.type === 'skill' ? '(Skill)' : `(${dep.type})`
    lines.push(`${prefix}${connector}${statusIcon} ${dep.label} ${typeLabel}`)

    // Find nested dependencies
    const nested = result.dependencies.filter(
      (d) => !d.direct && d.requiredBy.includes(`${dep.type}:${dep.id}`)
    )

    const newPrefix = prefix + (isLast ? '    ' : '│   ')
    nested.forEach((nestedDep, i) => {
      buildTree(nestedDep, newPrefix, i === nested.length - 1)
    })
  }

  directDeps.forEach((dep, i) => {
    buildTree(dep, '', i === directDeps.length - 1)
  })

  return lines.join('\n')
}

/**
 * Batch resolve dependencies for multiple items
 */
export async function batchResolveDependencies(
  itemIds: string[]
): Promise<Map<string, DependencyResolutionResult>> {
  const results = new Map<string, DependencyResolutionResult>()

  for (const itemId of itemIds) {
    try {
      results.set(itemId, await resolveAllDependencies(itemId))
    } catch (error) {
      log.error('Failed to resolve dependencies', { itemId, error })
    }
  }

  return results
}

/**
 * Generate MCP server configuration snippet
 */
export function generateMcpConfig(mcpDependencies: ResolvedDependency[]): {
  servers: Record<string, { type: string; url?: string; command?: string; args?: string[] }>
  instructions: string[]
} {
  const servers: Record<string, { type: string; url?: string; command?: string; args?: string[] }> = {}
  const instructions: string[] = []

  for (const dep of mcpDependencies) {
    if (dep.type !== 'mcp') continue

    const mcpInfo = MCP_SERVERS[dep.id]
    if (!mcpInfo) {
      instructions.push(`⚠️ Unknown MCP server: ${dep.id}. Please configure manually.`)
      continue
    }

    // Default configurations for known servers
    switch (dep.id) {
      case 'github':
        servers[dep.id] = {
          type: 'command',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        }
        instructions.push(`Set GITHUB_PERSONAL_ACCESS_TOKEN environment variable`)
        break

      case 'filesystem':
        servers[dep.id] = {
          type: 'command',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
        }
        instructions.push(`Update the filesystem path in the configuration`)
        break

      case 'postgresql':
        servers[dep.id] = {
          type: 'command',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:pass@localhost/db'],
        }
        instructions.push(`Update the PostgreSQL connection string`)
        break

      case 'sqlite':
        servers[dep.id] = {
          type: 'command',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
        }
        instructions.push(`Update the SQLite database path`)
        break

      default:
        instructions.push(`Configure ${mcpInfo.label} according to its documentation: ${MCP_CONFIG_URLS[dep.id] || 'N/A'}`)
    }
  }

  return { servers, instructions }
}
