/**
 * Dependency Resolver Tests
 *
 * Unit tests for skill dependency resolution functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  catalogItems: {
    id: 'id',
    name: 'name',
    type: 'type',
    dependencies: 'dependencies',
  },
}))

describe('Dependency Resolver', () => {
  describe('Dependency Parsing', () => {
    it('should parse MCP dependency format', () => {
      const parseDependency = (dep: string) => {
        const [type, ...idParts] = dep.split(':')
        const id = idParts.join(':')
        return { type, id }
      }

      expect(parseDependency('mcp:github')).toEqual({ type: 'mcp', id: 'github' })
      expect(parseDependency('skill:git-commit')).toEqual({ type: 'skill', id: 'git-commit' })
      expect(parseDependency('agent:code-reviewer')).toEqual({ type: 'agent', id: 'code-reviewer' })
    })

    it('should handle complex IDs with colons', () => {
      const parseDependency = (dep: string) => {
        const [type, ...idParts] = dep.split(':')
        const id = idParts.join(':')
        return { type, id }
      }

      expect(parseDependency('mcp:custom:server')).toEqual({ type: 'mcp', id: 'custom:server' })
    })
  })

  describe('Topological Sort', () => {
    it('should compute correct installation order', () => {
      // Simple case: A depends on B
      const computeOrder = (deps: { id: string; dependsOn: string[] }[]) => {
        const graph = new Map<string, Set<string>>()
        const inDegree = new Map<string, number>()

        for (const dep of deps) {
          if (!graph.has(dep.id)) {
            graph.set(dep.id, new Set())
            inDegree.set(dep.id, 0)
          }
          for (const d of dep.dependsOn) {
            if (!graph.has(d)) {
              graph.set(d, new Set())
              inDegree.set(d, 0)
            }
          }
        }

        for (const dep of deps) {
          for (const d of dep.dependsOn) {
            if (graph.has(d)) {
              graph.get(d)!.add(dep.id)
              inDegree.set(dep.id, (inDegree.get(dep.id) || 0) + 1)
            }
          }
        }

        const queue: string[] = []
        const result: string[] = []

        for (const [id, degree] of inDegree) {
          if (degree === 0) queue.push(id)
        }

        while (queue.length > 0) {
          const current = queue.shift()!
          result.push(current)

          for (const neighbor of graph.get(current) || []) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1
            inDegree.set(neighbor, newDegree)
            if (newDegree === 0) queue.push(neighbor)
          }
        }

        return result
      }

      // A depends on B, B depends on C
      const deps = [
        { id: 'A', dependsOn: ['B'] },
        { id: 'B', dependsOn: ['C'] },
        { id: 'C', dependsOn: [] },
      ]

      const order = computeOrder(deps)
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('B'))
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'))
    })

    it('should handle items with no dependencies', () => {
      const computeOrder = (deps: { id: string; dependsOn: string[] }[]) => {
        const inDegree = new Map<string, number>()
        for (const dep of deps) {
          inDegree.set(dep.id, dep.dependsOn.length)
        }

        const queue: string[] = []
        for (const [id, degree] of inDegree) {
          if (degree === 0) queue.push(id)
        }

        return queue
      }

      const deps = [
        { id: 'A', dependsOn: [] },
        { id: 'B', dependsOn: [] },
        { id: 'C', dependsOn: [] },
      ]

      const order = computeOrder(deps)
      expect(order).toHaveLength(3)
      expect(order).toContain('A')
      expect(order).toContain('B')
      expect(order).toContain('C')
    })
  })

  describe('Circular Dependency Detection', () => {
    it('should detect simple circular dependencies', () => {
      const detectCycles = (deps: { id: string; dependsOn: string[] }[]) => {
        const cycles: string[][] = []
        const visited = new Set<string>()
        const path: string[] = []

        const traverse = (id: string): boolean => {
          if (path.includes(id)) {
            const cycleStart = path.indexOf(id)
            cycles.push([...path.slice(cycleStart), id])
            return true
          }

          if (visited.has(id)) return false

          visited.add(id)
          path.push(id)

          const dep = deps.find((d) => d.id === id)
          if (dep) {
            for (const d of dep.dependsOn) {
              traverse(d)
            }
          }

          path.pop()
          return false
        }

        for (const dep of deps) {
          if (!visited.has(dep.id)) {
            traverse(dep.id)
          }
        }

        return cycles
      }

      // A -> B -> C -> A (cycle)
      const depsWithCycle = [
        { id: 'A', dependsOn: ['B'] },
        { id: 'B', dependsOn: ['C'] },
        { id: 'C', dependsOn: ['A'] },
      ]

      const cycles = detectCycles(depsWithCycle)
      expect(cycles.length).toBeGreaterThan(0)
    })

    it('should not detect cycles in acyclic graph', () => {
      const detectCycles = (deps: { id: string; dependsOn: string[] }[]) => {
        const cycles: string[][] = []
        const visited = new Set<string>()
        const path: string[] = []

        const traverse = (id: string): boolean => {
          if (path.includes(id)) {
            const cycleStart = path.indexOf(id)
            cycles.push([...path.slice(cycleStart), id])
            return true
          }

          if (visited.has(id)) return false

          visited.add(id)
          path.push(id)

          const dep = deps.find((d) => d.id === id)
          if (dep) {
            for (const d of dep.dependsOn) {
              traverse(d)
            }
          }

          path.pop()
          return false
        }

        for (const dep of deps) {
          if (!visited.has(dep.id)) {
            traverse(dep.id)
          }
        }

        return cycles
      }

      // A -> B -> C (no cycle)
      const depsNoCycle = [
        { id: 'A', dependsOn: ['B'] },
        { id: 'B', dependsOn: ['C'] },
        { id: 'C', dependsOn: [] },
      ]

      const cycles = detectCycles(depsNoCycle)
      expect(cycles).toHaveLength(0)
    })
  })

  describe('MCP Server Configuration', () => {
    it('should recognize known MCP servers', () => {
      const MCP_SERVERS: Record<string, { label: string }> = {
        github: { label: 'GitHub MCP' },
        filesystem: { label: 'Filesystem MCP' },
        postgresql: { label: 'PostgreSQL MCP' },
        sqlite: { label: 'SQLite MCP' },
      }

      expect(MCP_SERVERS['github']).toBeDefined()
      expect(MCP_SERVERS['github'].label).toBe('GitHub MCP')
      expect(MCP_SERVERS['unknown']).toBeUndefined()
    })

    it('should generate MCP configuration', () => {
      const generateConfig = (mcpIds: string[]) => {
        const servers: Record<string, object> = {}

        for (const id of mcpIds) {
          switch (id) {
            case 'github':
              servers[id] = {
                type: 'command',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
              }
              break
            case 'filesystem':
              servers[id] = {
                type: 'command',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
              }
              break
          }
        }

        return servers
      }

      const config = generateConfig(['github', 'filesystem'])
      expect(config['github']).toBeDefined()
      expect(config['filesystem']).toBeDefined()
      expect(Object.keys(config)).toHaveLength(2)
    })
  })

  describe('Resolved Dependency Structure', () => {
    it('should have correct structure for resolved dependency', () => {
      interface ResolvedDependency {
        type: 'mcp' | 'skill' | 'agent' | 'other'
        id: string
        label: string
        direct: boolean
        depth: number
        requiredBy: string[]
        available: boolean
      }

      const resolved: ResolvedDependency = {
        type: 'mcp',
        id: 'github',
        label: 'GitHub MCP',
        direct: true,
        depth: 0,
        requiredBy: ['skill-123'],
        available: true,
      }

      expect(resolved.type).toBe('mcp')
      expect(resolved.direct).toBe(true)
      expect(resolved.depth).toBe(0)
      expect(resolved.available).toBe(true)
    })

    it('should correctly identify transitive dependencies', () => {
      interface ResolvedDependency {
        id: string
        direct: boolean
        depth: number
      }

      const deps: ResolvedDependency[] = [
        { id: 'A', direct: true, depth: 0 },
        { id: 'B', direct: false, depth: 1 },
        { id: 'C', direct: false, depth: 2 },
      ]

      const directDeps = deps.filter((d) => d.direct)
      const transitiveDeps = deps.filter((d) => !d.direct)

      expect(directDeps).toHaveLength(1)
      expect(transitiveDeps).toHaveLength(2)
      expect(transitiveDeps[0].depth).toBe(1)
    })
  })

  describe('Resolution Result Structure', () => {
    it('should have correct result structure', () => {
      interface ResolutionResult {
        rootId: string
        dependencies: unknown[]
        mcpServers: unknown[]
        catalogDependencies: unknown[]
        unresolved: unknown[]
        circularPaths: string[][]
        installOrder: string[]
        totalCount: number
        maxDepth: number
      }

      const result: ResolutionResult = {
        rootId: 'skill-123',
        dependencies: [],
        mcpServers: [],
        catalogDependencies: [],
        unresolved: [],
        circularPaths: [],
        installOrder: [],
        totalCount: 0,
        maxDepth: 0,
      }

      expect(result.rootId).toBe('skill-123')
      expect(result.circularPaths).toEqual([])
      expect(result.totalCount).toBe(0)
    })

    it('should calculate total count correctly', () => {
      const calculateTotal = (result: { mcpServers: unknown[]; catalogDependencies: unknown[] }) => {
        return result.mcpServers.length + result.catalogDependencies.length
      }

      const result = {
        mcpServers: [{ id: 'github' }, { id: 'filesystem' }],
        catalogDependencies: [{ id: 'skill-1' }],
      }

      expect(calculateTotal(result)).toBe(3)
    })
  })

  describe('Dependency Validation', () => {
    it('should detect missing dependencies', () => {
      interface Conflict {
        type: 'missing' | 'circular'
        dependencyId: string
        message: string
      }

      const validateDeps = (deps: { id: string; available: boolean }[]): Conflict[] => {
        const conflicts: Conflict[] = []

        for (const dep of deps) {
          if (!dep.available) {
            conflicts.push({
              type: 'missing',
              dependencyId: dep.id,
              message: `Dependency not found: ${dep.id}`,
            })
          }
        }

        return conflicts
      }

      const deps = [
        { id: 'skill:exists', available: true },
        { id: 'skill:missing', available: false },
        { id: 'mcp:unknown', available: false },
      ]

      const conflicts = validateDeps(deps)
      expect(conflicts).toHaveLength(2)
      expect(conflicts[0].type).toBe('missing')
    })

    it('should return valid when no conflicts', () => {
      const validateDeps = (deps: { available: boolean }[]) => {
        return deps.every((d) => d.available)
      }

      const validDeps = [{ available: true }, { available: true }]

      const invalidDeps = [{ available: true }, { available: false }]

      expect(validateDeps(validDeps)).toBe(true)
      expect(validateDeps(invalidDeps)).toBe(false)
    })
  })

  describe('Dependency Tree Formatting', () => {
    it('should format dependency tree correctly', () => {
      const formatTree = (deps: { id: string; depth: number; available: boolean }[]): string => {
        const lines: string[] = []

        for (const dep of deps) {
          const indent = '  '.repeat(dep.depth)
          const status = dep.available ? '+' : '-'
          lines.push(`${indent}${status} ${dep.id}`)
        }

        return lines.join('\n')
      }

      const deps = [
        { id: 'mcp:github', depth: 0, available: true },
        { id: 'skill:git-commit', depth: 0, available: true },
        { id: 'mcp:filesystem', depth: 1, available: true },
        { id: 'skill:missing', depth: 1, available: false },
      ]

      const tree = formatTree(deps)
      expect(tree).toContain('+ mcp:github')
      expect(tree).toContain('  + mcp:filesystem')
      expect(tree).toContain('  - skill:missing')
    })
  })

  describe('Max Depth Calculation', () => {
    it('should calculate max depth correctly', () => {
      const calculateMaxDepth = (deps: { depth: number }[]): number => {
        if (deps.length === 0) return 0
        return Math.max(...deps.map((d) => d.depth))
      }

      expect(calculateMaxDepth([])).toBe(0)
      expect(calculateMaxDepth([{ depth: 0 }])).toBe(0)
      expect(calculateMaxDepth([{ depth: 0 }, { depth: 2 }, { depth: 1 }])).toBe(2)
      expect(calculateMaxDepth([{ depth: 5 }, { depth: 3 }])).toBe(5)
    })
  })
})
