/**
 * Plugin Dependency Graph Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildDependencyGraph,
  detectCircularDependencies,
  analyzeImpact,
  getDependencyPath,
  getNodesAtDepth,
  getDirectDependencies,
  getDirectDependents,
  calculateTreeLayout,
  createMockPlugin,
  createMockDependency,
  getGraphStatistics,
  exportToDot,
  exportToMermaid,
  NODE_STATUS_CONFIG,
  DEPENDENCY_TYPE_CONFIG,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_FILTER_OPTIONS,
  type PluginWithDependencies,
  type DependencyGraph,
  type GraphFilterOptions,
} from '@/lib/plugin/dependency-graph'

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('plugin-dependency-graph', () => {
  describe('createMockPlugin', () => {
    it('should create a plugin with basic info', () => {
      const plugin = createMockPlugin('plugin-1', 'Test Plugin', '1.0.0')

      expect(plugin.id).toBe('plugin-1')
      expect(plugin.name).toBe('Test Plugin')
      expect(plugin.version).toBe('1.0.0')
      expect(plugin.status).toBe('installed')
      expect(plugin.dependencies).toEqual([])
    })

    it('should create a plugin with dependencies', () => {
      const deps = [
        createMockDependency('dep-1', 'Dep 1', '^1.0.0'),
        createMockDependency('dep-2', 'Dep 2', '^2.0.0'),
      ]
      const plugin = createMockPlugin('plugin-1', 'Test Plugin', '1.0.0', deps)

      expect(plugin.dependencies).toHaveLength(2)
    })

    it('should accept custom status', () => {
      const plugin = createMockPlugin('plugin-1', 'Test Plugin', '1.0.0', [], 'outdated')

      expect(plugin.status).toBe('outdated')
    })
  })

  describe('createMockDependency', () => {
    it('should create a dependency with defaults', () => {
      const dep = createMockDependency('dep-1', 'Dep 1', '^1.0.0')

      expect(dep.pluginId).toBe('dep-1')
      expect(dep.name).toBe('Dep 1')
      expect(dep.versionRange).toBe('^1.0.0')
      expect(dep.type).toBe('required')
      expect(dep.installed).toBe(true)
      expect(dep.satisfies).toBe(true)
    })

    it('should accept custom options', () => {
      const dep = createMockDependency('dep-1', 'Dep 1', '^1.0.0', {
        type: 'optional',
        installed: false,
        satisfies: false,
      })

      expect(dep.type).toBe('optional')
      expect(dep.installed).toBe(false)
      expect(dep.satisfies).toBe(false)
    })
  })

  describe('buildDependencyGraph', () => {
    let allPlugins: Map<string, PluginWithDependencies>

    beforeEach(() => {
      allPlugins = new Map()

      const pluginB = createMockPlugin('plugin-b', 'Plugin B', '1.0.0')
      const pluginC = createMockPlugin('plugin-c', 'Plugin C', '1.0.0')
      const pluginA = createMockPlugin('plugin-a', 'Plugin A', '1.0.0', [
        createMockDependency('plugin-b', 'Plugin B', '^1.0.0'),
        createMockDependency('plugin-c', 'Plugin C', '^1.0.0'),
      ])

      allPlugins.set('plugin-a', pluginA)
      allPlugins.set('plugin-b', pluginB)
      allPlugins.set('plugin-c', pluginC)
    })

    it('should build graph from root plugin', () => {
      const root = allPlugins.get('plugin-a')!
      const graph = buildDependencyGraph(root, allPlugins)

      expect(graph.nodes).toHaveLength(3)
      expect(graph.edges).toHaveLength(2)
      expect(graph.rootId).toBe('plugin-a')
    })

    it('should set correct depth for nodes', () => {
      const root = allPlugins.get('plugin-a')!
      const graph = buildDependencyGraph(root, allPlugins)

      const nodeA = graph.nodes.find((n) => n.id === 'plugin-a')
      const nodeB = graph.nodes.find((n) => n.id === 'plugin-b')

      expect(nodeA?.depth).toBe(0)
      expect(nodeA?.isRoot).toBe(true)
      expect(nodeB?.depth).toBe(1)
    })

    it('should mark root node correctly', () => {
      const root = allPlugins.get('plugin-a')!
      const graph = buildDependencyGraph(root, allPlugins)

      const rootNode = graph.nodes.find((n) => n.id === 'plugin-a')
      expect(rootNode?.isRoot).toBe(true)

      const otherNodes = graph.nodes.filter((n) => n.id !== 'plugin-a')
      expect(otherNodes.every((n) => !n.isRoot)).toBe(true)
    })

    it('should add placeholder for uninstalled dependency', () => {
      const root = createMockPlugin('root', 'Root', '1.0.0', [
        createMockDependency('missing', 'Missing Plugin', '^1.0.0', { installed: false }),
      ])

      const plugins = new Map([['root', root]])
      const graph = buildDependencyGraph(root, plugins)

      const missingNode = graph.nodes.find((n) => n.id === 'missing')
      expect(missingNode).toBeDefined()
      expect(missingNode?.status).toBe('not_installed')
    })

    it('should respect maxDepth filter', () => {
      // Create deep hierarchy: A -> B -> C -> D
      const pluginD = createMockPlugin('d', 'D', '1.0.0')
      const pluginC = createMockPlugin('c', 'C', '1.0.0', [
        createMockDependency('d', 'D', '^1.0.0'),
      ])
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('c', 'C', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([
        ['a', pluginA],
        ['b', pluginB],
        ['c', pluginC],
        ['d', pluginD],
      ])

      const graph = buildDependencyGraph(pluginA, plugins, { ...DEFAULT_FILTER_OPTIONS, maxDepth: 1 })

      expect(graph.depth).toBe(1)
      expect(graph.nodes.length).toBeLessThan(4)
    })

    it('should filter optional dependencies', () => {
      const root = createMockPlugin('root', 'Root', '1.0.0', [], 'installed')
      root.optionalDependencies = [
        createMockDependency('opt', 'Optional', '^1.0.0', { type: 'optional' }),
      ]

      const plugins = new Map([['root', root]])

      const graphWithOptional = buildDependencyGraph(root, plugins, { ...DEFAULT_FILTER_OPTIONS, showOptional: true })
      expect(graphWithOptional.edges.length).toBe(1)

      const graphWithoutOptional = buildDependencyGraph(root, plugins, { ...DEFAULT_FILTER_OPTIONS, showOptional: false })
      expect(graphWithoutOptional.edges.length).toBe(0)
    })
  })

  describe('cycle detection', () => {
    it('should detect simple cycle', () => {
      // A -> B -> A
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('a', 'A', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([
        ['a', pluginA],
        ['b', pluginB],
      ])

      const graph = buildDependencyGraph(pluginA, plugins)

      expect(graph.hasCycles).toBe(true)
      expect(graph.cycles.length).toBeGreaterThan(0)
    })

    it('should detect complex cycle', () => {
      // A -> B -> C -> A
      const pluginC = createMockPlugin('c', 'C', '1.0.0', [
        createMockDependency('a', 'A', '^1.0.0'),
      ])
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('c', 'C', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([
        ['a', pluginA],
        ['b', pluginB],
        ['c', pluginC],
      ])

      const graph = buildDependencyGraph(pluginA, plugins)

      expect(graph.hasCycles).toBe(true)
    })

    it('should mark cyclic nodes', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('a', 'A', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([
        ['a', pluginA],
        ['b', pluginB],
      ])

      const graph = buildDependencyGraph(pluginA, plugins)

      const nodeA = graph.nodes.find((n) => n.id === 'a')
      const nodeB = graph.nodes.find((n) => n.id === 'b')

      expect(nodeA?.isCyclic).toBe(true)
      expect(nodeB?.isCyclic).toBe(true)
    })

    it('should not report cycle for acyclic graph', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([
        ['a', pluginA],
        ['b', pluginB],
      ])

      const graph = buildDependencyGraph(pluginA, plugins)

      expect(graph.hasCycles).toBe(false)
      expect(graph.cycles).toHaveLength(0)
    })
  })

  describe('detectCircularDependencies', () => {
    it('should return result with no cycles', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const result = detectCircularDependencies(graph)

      expect(result.hasCycles).toBe(false)
      expect(result.affectedNodes).toHaveLength(0)
      expect(result.recommendations).toHaveLength(0)
    })

    it('should return affected nodes for cycles', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('a', 'A', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const result = detectCircularDependencies(graph)

      expect(result.hasCycles).toBe(true)
      expect(result.affectedNodes.length).toBeGreaterThan(0)
      expect(result.recommendations.length).toBeGreaterThan(0)
    })
  })

  describe('analyzeImpact', () => {
    let plugins: Map<string, PluginWithDependencies>

    beforeEach(() => {
      // A depends on B, B depends on C, D depends on A
      const pluginC = createMockPlugin('c', 'C', '1.0.0')
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('c', 'C', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])
      const pluginD = createMockPlugin('d', 'D', '1.0.0', [
        createMockDependency('a', 'A', '^1.0.0'),
      ])

      plugins = new Map([
        ['a', pluginA],
        ['b', pluginB],
        ['c', pluginC],
        ['d', pluginD],
      ])
    })

    it('should find direct dependents', () => {
      const impact = analyzeImpact('b', plugins)

      expect(impact.directDependents).toContain('a')
    })

    it('should find transitive dependents', () => {
      const impact = analyzeImpact('c', plugins)

      expect(impact.directDependents).toContain('b')
      expect(impact.transitiveDependents).toContain('a')
    })

    it('should calculate total affected', () => {
      const impact = analyzeImpact('c', plugins)

      expect(impact.totalAffected).toBe(impact.directDependents.length + impact.transitiveDependents.length)
    })

    it('should mark breaking change when has direct dependents', () => {
      const impact = analyzeImpact('b', plugins)

      expect(impact.breakingChange).toBe(true)
    })

    it('should not mark breaking change when no direct dependents', () => {
      const impact = analyzeImpact('d', plugins)

      expect(impact.breakingChange).toBe(false)
    })

    it('should assign severity levels', () => {
      const impact = analyzeImpact('c', plugins)

      const directPlugin = impact.affectedPlugins.find((p) => p.impact === 'direct')
      const transitivePlugin = impact.affectedPlugins.find((p) => p.impact === 'transitive')

      expect(directPlugin?.severity).toBe('critical')
      expect(transitivePlugin?.severity).toBe('major')
    })
  })

  describe('getDependencyPath', () => {
    it('should find path between connected nodes', () => {
      const pluginC = createMockPlugin('c', 'C', '1.0.0')
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('c', 'C', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB], ['c', pluginC]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const path = getDependencyPath(graph, 'a', 'c')

      expect(path).toEqual(['a', 'b', 'c'])
    })

    it('should return null for disconnected nodes', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0')

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)

      // B is not in the graph since A has no dependencies
      const path = getDependencyPath(graph, 'a', 'b')

      expect(path).toBeNull()
    })

    it('should return single node path for same node', () => {
      const pluginA = createMockPlugin('a', 'A', '1.0.0')
      const plugins = new Map([['a', pluginA]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const path = getDependencyPath(graph, 'a', 'a')

      expect(path).toEqual(['a'])
    })
  })

  describe('getNodesAtDepth', () => {
    it('should return nodes at specified depth', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginC = createMockPlugin('c', 'C', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
        createMockDependency('c', 'C', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB], ['c', pluginC]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const depth0 = getNodesAtDepth(graph, 0)
      const depth1 = getNodesAtDepth(graph, 1)

      expect(depth0).toHaveLength(1)
      expect(depth0[0].id).toBe('a')
      expect(depth1).toHaveLength(2)
    })
  })

  describe('getDirectDependencies', () => {
    it('should return direct dependencies', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginC = createMockPlugin('c', 'C', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
        createMockDependency('c', 'C', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB], ['c', pluginC]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const deps = getDirectDependencies(graph, 'a')

      expect(deps).toHaveLength(2)
      expect(deps.map((d) => d.id).sort()).toEqual(['b', 'c'])
    })

    it('should return empty for leaf node', () => {
      const pluginA = createMockPlugin('a', 'A', '1.0.0')
      const plugins = new Map([['a', pluginA]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const deps = getDirectDependencies(graph, 'a')

      expect(deps).toHaveLength(0)
    })
  })

  describe('getDirectDependents', () => {
    it('should return direct dependents', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const dependents = getDirectDependents(graph, 'b')

      expect(dependents).toHaveLength(1)
      expect(dependents[0].id).toBe('a')
    })
  })

  describe('calculateTreeLayout', () => {
    it('should assign positions to nodes', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const layout = calculateTreeLayout(graph)

      for (const node of layout.nodes) {
        expect(node.x).toBeDefined()
        expect(node.y).toBeDefined()
      }
    })

    it('should handle different directions', () => {
      const pluginA = createMockPlugin('a', 'A', '1.0.0')
      const plugins = new Map([['a', pluginA]])
      const graph = buildDependencyGraph(pluginA, plugins)

      const tbLayout = calculateTreeLayout(graph, { ...DEFAULT_LAYOUT_OPTIONS, direction: 'TB' })
      const lrLayout = calculateTreeLayout(graph, { ...DEFAULT_LAYOUT_OPTIONS, direction: 'LR' })

      // Different layouts should produce different positions (or at least different orientations)
      expect(tbLayout.nodes[0].x).toBeDefined()
      expect(lrLayout.nodes[0].x).toBeDefined()
    })
  })

  describe('getGraphStatistics', () => {
    it('should calculate correct statistics', () => {
      const pluginC = createMockPlugin('c', 'C', '1.0.0', [], 'not_installed')
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('c', 'C', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB], ['c', pluginC]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const stats = getGraphStatistics(graph)

      expect(stats.totalNodes).toBe(3)
      expect(stats.totalEdges).toBe(2)
      expect(stats.maxDepth).toBe(2)
      expect(stats.installedCount).toBe(2)
      expect(stats.notInstalledCount).toBe(1)
    })

    it('should calculate average dependencies', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginC = createMockPlugin('c', 'C', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
        createMockDependency('c', 'C', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB], ['c', pluginC]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const stats = getGraphStatistics(graph)

      // 2 edges / 3 nodes
      expect(stats.avgDependencies).toBeCloseTo(2 / 3, 1)
    })
  })

  describe('exportToDot', () => {
    it('should generate valid DOT format', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const dot = exportToDot(graph)

      expect(dot).toContain('digraph DependencyGraph')
      expect(dot).toContain('"a"')
      expect(dot).toContain('"b"')
      expect(dot).toContain('->')
    })
  })

  describe('exportToMermaid', () => {
    it('should generate valid Mermaid format', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0')
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const mermaid = exportToMermaid(graph)

      expect(mermaid).toContain('graph TD')
      expect(mermaid).toContain('a')
      expect(mermaid).toContain('b')
      expect(mermaid).toContain('-->')
    })

    it('should add cycle styling', () => {
      const pluginB = createMockPlugin('b', 'B', '1.0.0', [
        createMockDependency('a', 'A', '^1.0.0'),
      ])
      const pluginA = createMockPlugin('a', 'A', '1.0.0', [
        createMockDependency('b', 'B', '^1.0.0'),
      ])

      const plugins = new Map([['a', pluginA], ['b', pluginB]])
      const graph = buildDependencyGraph(pluginA, plugins)
      const mermaid = exportToMermaid(graph)

      expect(mermaid).toContain('classDef cyclic')
    })
  })

  describe('constants', () => {
    it('should have node status configs for all statuses', () => {
      const statuses = ['installed', 'not_installed', 'outdated', 'error', 'optional']
      for (const status of statuses) {
        expect(NODE_STATUS_CONFIG[status as keyof typeof NODE_STATUS_CONFIG]).toBeDefined()
        expect(NODE_STATUS_CONFIG[status as keyof typeof NODE_STATUS_CONFIG].color).toBeDefined()
        expect(NODE_STATUS_CONFIG[status as keyof typeof NODE_STATUS_CONFIG].icon).toBeDefined()
        expect(NODE_STATUS_CONFIG[status as keyof typeof NODE_STATUS_CONFIG].label).toBeDefined()
      }
    })

    it('should have dependency type configs for all types', () => {
      const types = ['required', 'optional', 'peer', 'dev']
      for (const type of types) {
        expect(DEPENDENCY_TYPE_CONFIG[type as keyof typeof DEPENDENCY_TYPE_CONFIG]).toBeDefined()
        expect(DEPENDENCY_TYPE_CONFIG[type as keyof typeof DEPENDENCY_TYPE_CONFIG].color).toBeDefined()
        expect(DEPENDENCY_TYPE_CONFIG[type as keyof typeof DEPENDENCY_TYPE_CONFIG].label).toBeDefined()
      }
    })

    it('should have valid default options', () => {
      expect(DEFAULT_LAYOUT_OPTIONS.type).toBe('tree')
      expect(DEFAULT_LAYOUT_OPTIONS.direction).toBe('TB')
      expect(DEFAULT_FILTER_OPTIONS.showOptional).toBe(true)
      expect(DEFAULT_FILTER_OPTIONS.highlightCycles).toBe(true)
    })
  })
})
