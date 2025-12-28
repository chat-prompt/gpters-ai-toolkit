/**
 * Plugin Dependency Graph Visualization
 *
 * Provides dependency relationship visualization:
 * - Interactive dependency tree
 * - Circular dependency detection
 * - Uninstalled dependency highlighting
 * - Impact range analysis
 */

import { createLogger } from '../logger'

const log = createLogger('plugin-dependency-graph')

/**
 * Node status in dependency graph
 */
export type NodeStatus = 'installed' | 'not_installed' | 'outdated' | 'error' | 'optional'

/**
 * Dependency type
 */
export type DependencyType = 'required' | 'optional' | 'peer' | 'dev'

/**
 * Relationship direction
 */
export type RelationshipDirection = 'depends_on' | 'depended_by'

/**
 * Graph node representing a plugin
 */
export interface GraphNode {
  id: string
  name: string
  version: string
  status: NodeStatus
  depth: number
  x?: number
  y?: number
  isRoot?: boolean
  isCyclic?: boolean
  metadata?: {
    author?: string
    description?: string
    downloadCount?: number
  }
}

/**
 * Graph edge representing a dependency
 */
export interface GraphEdge {
  source: string
  target: string
  type: DependencyType
  versionRange?: string
  isCyclic?: boolean
  isSatisfied?: boolean
}

/**
 * Dependency graph
 */
export interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  rootId: string
  depth: number
  hasCycles: boolean
  cycles: string[][]
  uninstalledCount: number
  outdatedCount: number
}

/**
 * Dependency info for a plugin
 */
export interface PluginDependency {
  pluginId: string
  name: string
  versionRange: string
  type: DependencyType
  installed: boolean
  installedVersion?: string
  satisfies?: boolean
}

/**
 * Plugin with dependencies
 */
export interface PluginWithDependencies {
  id: string
  name: string
  version: string
  status: NodeStatus
  dependencies: PluginDependency[]
  devDependencies?: PluginDependency[]
  peerDependencies?: PluginDependency[]
  optionalDependencies?: PluginDependency[]
}

/**
 * Impact analysis result
 */
export interface ImpactAnalysis {
  pluginId: string
  directDependents: string[]
  transitiveDependents: string[]
  totalAffected: number
  breakingChange: boolean
  affectedPlugins: {
    id: string
    name: string
    impact: 'direct' | 'transitive'
    severity: 'critical' | 'major' | 'minor'
  }[]
}

/**
 * Cycle detection result
 */
export interface CycleDetectionResult {
  hasCycles: boolean
  cycles: string[][]
  affectedNodes: string[]
  recommendations: string[]
}

/**
 * Graph layout options
 */
export interface GraphLayoutOptions {
  type: 'tree' | 'force' | 'radial' | 'hierarchical'
  direction?: 'TB' | 'BT' | 'LR' | 'RL'
  spacing?: number
  nodeSize?: number
}

/**
 * Graph filter options
 */
export interface GraphFilterOptions {
  showOptional?: boolean
  showDev?: boolean
  maxDepth?: number
  hideInstalled?: boolean
  highlightCycles?: boolean
}

/**
 * Default layout options
 */
export const DEFAULT_LAYOUT_OPTIONS: GraphLayoutOptions = {
  type: 'tree',
  direction: 'TB',
  spacing: 80,
  nodeSize: 40,
}

/**
 * Default filter options
 */
export const DEFAULT_FILTER_OPTIONS: GraphFilterOptions = {
  showOptional: true,
  showDev: false,
  maxDepth: Infinity,
  hideInstalled: false,
  highlightCycles: true,
}

/**
 * Node status configurations
 */
export const NODE_STATUS_CONFIG: Record<NodeStatus, { color: string; bgColor: string; icon: string; label: string }> = {
  installed: { color: 'text-green-400', bgColor: 'bg-green-500/20', icon: '✓', label: '설치됨' },
  not_installed: { color: 'text-red-400', bgColor: 'bg-red-500/20', icon: '✗', label: '미설치' },
  outdated: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', icon: '↻', label: '업데이트 필요' },
  error: { color: 'text-red-500', bgColor: 'bg-red-500/30', icon: '!', label: '오류' },
  optional: { color: 'text-gray-400', bgColor: 'bg-gray-500/20', icon: '?', label: '선택적' },
}

/**
 * Dependency type configurations
 */
export const DEPENDENCY_TYPE_CONFIG: Record<DependencyType, { color: string; label: string; style: string }> = {
  required: { color: 'stroke-blue-500', label: '필수', style: 'solid' },
  optional: { color: 'stroke-gray-400', label: '선택적', style: 'dashed' },
  peer: { color: 'stroke-purple-400', label: '피어', style: 'dotted' },
  dev: { color: 'stroke-yellow-400', label: '개발', style: 'dashed' },
}

/**
 * Build dependency graph from plugins
 */
export function buildDependencyGraph(
  rootPlugin: PluginWithDependencies,
  allPlugins: Map<string, PluginWithDependencies>,
  options: GraphFilterOptions = DEFAULT_FILTER_OPTIONS
): DependencyGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>() // For cycle detection
  const cycles: string[][] = []

  function traverse(plugin: PluginWithDependencies, depth: number, path: string[]): void {
    if (depth > (options.maxDepth ?? Infinity)) return

    const nodeId = plugin.id

    // Check for cycles
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId)
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), nodeId])
      }
      return
    }

    if (visited.has(nodeId)) return

    visiting.add(nodeId)
    visited.add(nodeId)

    // Add node
    nodes.push({
      id: nodeId,
      name: plugin.name,
      version: plugin.version,
      status: plugin.status,
      depth,
      isRoot: depth === 0,
      isCyclic: false, // Will be updated after cycle detection
    })

    // Get all dependencies based on filter
    const allDeps: PluginDependency[] = [
      ...plugin.dependencies,
      ...(options.showOptional ? plugin.optionalDependencies || [] : []),
      ...(options.showDev ? plugin.devDependencies || [] : []),
    ]

    // Process dependencies
    for (const dep of allDeps) {
      if (options.hideInstalled && dep.installed) continue

      // Add edge
      edges.push({
        source: nodeId,
        target: dep.pluginId,
        type: dep.type,
        versionRange: dep.versionRange,
        isSatisfied: dep.satisfies,
      })

      // Get child plugin or create placeholder
      const childPlugin = allPlugins.get(dep.pluginId)
      if (childPlugin) {
        traverse(childPlugin, depth + 1, [...path, nodeId])
      } else {
        // Add placeholder node for uninstalled dependency
        if (!visited.has(dep.pluginId)) {
          visited.add(dep.pluginId)
          nodes.push({
            id: dep.pluginId,
            name: dep.name,
            version: dep.versionRange,
            status: 'not_installed',
            depth: depth + 1,
          })
        }
      }
    }

    visiting.delete(nodeId)
  }

  traverse(rootPlugin, 0, [])

  // Mark cyclic nodes
  const cyclicNodes = new Set(cycles.flat())
  for (const node of nodes) {
    if (cyclicNodes.has(node.id)) {
      node.isCyclic = true
    }
  }

  // Mark cyclic edges
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      const edge = edges.find((e) => e.source === cycle[i] && e.target === cycle[i + 1])
      if (edge) edge.isCyclic = true
    }
  }

  const maxDepth = Math.max(...nodes.map((n) => n.depth), 0)
  const uninstalledCount = nodes.filter((n) => n.status === 'not_installed').length
  const outdatedCount = nodes.filter((n) => n.status === 'outdated').length

  log.info(`Built dependency graph: ${nodes.length} nodes, ${edges.length} edges, ${cycles.length} cycles`)

  return {
    nodes,
    edges,
    rootId: rootPlugin.id,
    depth: maxDepth,
    hasCycles: cycles.length > 0,
    cycles,
    uninstalledCount,
    outdatedCount,
  }
}

/**
 * Detect circular dependencies
 */
export function detectCircularDependencies(graph: DependencyGraph): CycleDetectionResult {
  const affectedNodes = new Set<string>()
  const recommendations: string[] = []

  for (const cycle of graph.cycles) {
    for (const nodeId of cycle) {
      affectedNodes.add(nodeId)
    }

    // Generate recommendation
    const cycleStr = cycle.join(' → ')
    recommendations.push(`순환 의존성 발견: ${cycleStr}`)
    recommendations.push(`해결 방안: ${cycle[0]} 또는 ${cycle[cycle.length - 2]}의 의존성을 제거하거나 재구성하세요.`)
  }

  return {
    hasCycles: graph.hasCycles,
    cycles: graph.cycles,
    affectedNodes: Array.from(affectedNodes),
    recommendations,
  }
}

/**
 * Analyze impact of removing or updating a plugin
 */
export function analyzeImpact(
  targetPluginId: string,
  allPlugins: Map<string, PluginWithDependencies>
): ImpactAnalysis {
  const directDependents: string[] = []
  const transitiveDependents: string[] = []
  const visited = new Set<string>()

  // Find direct dependents
  for (const [id, plugin] of allPlugins) {
    if (id === targetPluginId) continue

    const allDeps = [
      ...plugin.dependencies,
      ...(plugin.optionalDependencies || []),
      ...(plugin.peerDependencies || []),
    ]

    for (const dep of allDeps) {
      if (dep.pluginId === targetPluginId) {
        directDependents.push(id)
        break
      }
    }
  }

  // Find transitive dependents (BFS)
  const queue = [...directDependents]
  visited.add(targetPluginId)
  for (const id of directDependents) {
    visited.add(id)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const [id, plugin] of allPlugins) {
      if (visited.has(id)) continue

      const allDeps = [
        ...plugin.dependencies,
        ...(plugin.optionalDependencies || []),
      ]

      for (const dep of allDeps) {
        if (dep.pluginId === current) {
          transitiveDependents.push(id)
          visited.add(id)
          queue.push(id)
          break
        }
      }
    }
  }

  // Build affected plugins list
  const affectedPlugins: ImpactAnalysis['affectedPlugins'] = []

  for (const id of directDependents) {
    const plugin = allPlugins.get(id)
    if (plugin) {
      affectedPlugins.push({
        id,
        name: plugin.name,
        impact: 'direct',
        severity: 'critical',
      })
    }
  }

  for (const id of transitiveDependents) {
    const plugin = allPlugins.get(id)
    if (plugin) {
      affectedPlugins.push({
        id,
        name: plugin.name,
        impact: 'transitive',
        severity: 'major',
      })
    }
  }

  log.info(`Impact analysis for ${targetPluginId}: ${affectedPlugins.length} affected plugins`)

  return {
    pluginId: targetPluginId,
    directDependents,
    transitiveDependents,
    totalAffected: affectedPlugins.length,
    breakingChange: directDependents.length > 0,
    affectedPlugins,
  }
}

/**
 * Get dependency path between two plugins
 */
export function getDependencyPath(
  graph: DependencyGraph,
  fromId: string,
  toId: string
): string[] | null {
  const visited = new Set<string>()
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }]

  while (queue.length > 0) {
    const { id, path } = queue.shift()!

    if (id === toId) {
      return path
    }

    if (visited.has(id)) continue
    visited.add(id)

    const outgoing = graph.edges.filter((e) => e.source === id)
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        queue.push({ id: edge.target, path: [...path, edge.target] })
      }
    }
  }

  return null
}

/**
 * Get all nodes at a specific depth
 */
export function getNodesAtDepth(graph: DependencyGraph, depth: number): GraphNode[] {
  return graph.nodes.filter((n) => n.depth === depth)
}

/**
 * Get direct dependencies of a node
 */
export function getDirectDependencies(graph: DependencyGraph, nodeId: string): GraphNode[] {
  const depIds = graph.edges.filter((e) => e.source === nodeId).map((e) => e.target)

  return graph.nodes.filter((n) => depIds.includes(n.id))
}

/**
 * Get direct dependents of a node
 */
export function getDirectDependents(graph: DependencyGraph, nodeId: string): GraphNode[] {
  const depIds = graph.edges.filter((e) => e.target === nodeId).map((e) => e.source)

  return graph.nodes.filter((n) => depIds.includes(n.id))
}

/**
 * Calculate tree layout positions
 */
export function calculateTreeLayout(
  graph: DependencyGraph,
  options: GraphLayoutOptions = DEFAULT_LAYOUT_OPTIONS
): DependencyGraph {
  const spacing = options.spacing ?? 80
  const nodeSize = options.nodeSize ?? 40

  // Group nodes by depth
  const nodesByDepth = new Map<number, GraphNode[]>()
  for (const node of graph.nodes) {
    const depthNodes = nodesByDepth.get(node.depth) || []
    depthNodes.push(node)
    nodesByDepth.set(node.depth, depthNodes)
  }

  // Calculate positions
  const updatedNodes = graph.nodes.map((node) => {
    const depthNodes = nodesByDepth.get(node.depth) || []
    const index = depthNodes.indexOf(node)
    const totalWidth = depthNodes.length * (nodeSize + spacing)
    const startX = -totalWidth / 2 + nodeSize / 2

    let x: number
    let y: number

    switch (options.direction) {
      case 'TB':
        x = startX + index * (nodeSize + spacing)
        y = node.depth * (nodeSize + spacing)
        break
      case 'BT':
        x = startX + index * (nodeSize + spacing)
        y = (graph.depth - node.depth) * (nodeSize + spacing)
        break
      case 'LR':
        x = node.depth * (nodeSize + spacing)
        y = startX + index * (nodeSize + spacing)
        break
      case 'RL':
        x = (graph.depth - node.depth) * (nodeSize + spacing)
        y = startX + index * (nodeSize + spacing)
        break
      default:
        x = startX + index * (nodeSize + spacing)
        y = node.depth * (nodeSize + spacing)
    }

    return { ...node, x, y }
  })

  return { ...graph, nodes: updatedNodes }
}

/**
 * Create mock plugin with dependencies
 */
export function createMockPlugin(
  id: string,
  name: string,
  version: string,
  dependencies: PluginDependency[] = [],
  status: NodeStatus = 'installed'
): PluginWithDependencies {
  return {
    id,
    name,
    version,
    status,
    dependencies,
  }
}

/**
 * Create mock dependency
 */
export function createMockDependency(
  pluginId: string,
  name: string,
  versionRange: string,
  options: Partial<{
    type: DependencyType
    installed: boolean
    installedVersion: string
    satisfies: boolean
  }> = {}
): PluginDependency {
  return {
    pluginId,
    name,
    versionRange,
    type: options.type || 'required',
    installed: options.installed ?? true,
    installedVersion: options.installedVersion,
    satisfies: options.satisfies ?? true,
  }
}

/**
 * Get graph statistics
 */
export function getGraphStatistics(graph: DependencyGraph): {
  totalNodes: number
  totalEdges: number
  maxDepth: number
  avgDependencies: number
  installedCount: number
  notInstalledCount: number
  outdatedCount: number
  cycleCount: number
} {
  const totalNodes = graph.nodes.length
  const totalEdges = graph.edges.length
  const installedCount = graph.nodes.filter((n) => n.status === 'installed').length
  const notInstalledCount = graph.nodes.filter((n) => n.status === 'not_installed').length
  const outdatedCount = graph.nodes.filter((n) => n.status === 'outdated').length

  return {
    totalNodes,
    totalEdges,
    maxDepth: graph.depth,
    avgDependencies: totalNodes > 0 ? totalEdges / totalNodes : 0,
    installedCount,
    notInstalledCount,
    outdatedCount,
    cycleCount: graph.cycles.length,
  }
}

/**
 * Export graph to DOT format (for Graphviz)
 */
export function exportToDot(graph: DependencyGraph): string {
  const lines: string[] = ['digraph DependencyGraph {']
  lines.push('  rankdir=TB;')
  lines.push('  node [shape=box, style=rounded];')
  lines.push('')

  // Add nodes
  for (const node of graph.nodes) {
    const config = NODE_STATUS_CONFIG[node.status]
    const color = node.isCyclic ? 'red' : node.status === 'installed' ? 'green' : 'gray'
    lines.push(`  "${node.id}" [label="${node.name}\\nv${node.version}", color="${color}"];`)
  }

  lines.push('')

  // Add edges
  for (const edge of graph.edges) {
    const style = edge.isCyclic ? 'bold, color=red' : edge.type === 'optional' ? 'dashed' : 'solid'
    lines.push(`  "${edge.source}" -> "${edge.target}" [style="${style}"];`)
  }

  lines.push('}')
  return lines.join('\n')
}

/**
 * Export graph to Mermaid format
 */
export function exportToMermaid(graph: DependencyGraph): string {
  const lines: string[] = ['graph TD']

  // Add nodes with styling
  for (const node of graph.nodes) {
    const shape = node.isRoot ? `((${node.name}))` : node.status === 'not_installed' ? `[/${node.name}/]` : `[${node.name}]`
    lines.push(`  ${node.id}${shape}`)
  }

  // Add edges
  for (const edge of graph.edges) {
    const arrow = edge.type === 'optional' ? '-..->' : '-->'
    lines.push(`  ${edge.source} ${arrow} ${edge.target}`)
  }

  // Add styling for cycles
  if (graph.hasCycles) {
    const cyclicNodes = new Set(graph.cycles.flat())
    lines.push('')
    lines.push(`  classDef cyclic fill:#f96,stroke:#333`)
    lines.push(`  class ${Array.from(cyclicNodes).join(',')} cyclic`)
  }

  return lines.join('\n')
}
