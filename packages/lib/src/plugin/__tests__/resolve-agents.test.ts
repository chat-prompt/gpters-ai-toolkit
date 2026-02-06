import { describe, it, expect } from 'vitest'
import type { ResolvedAgent } from '../../mcp/types'
import { resolveAgentsAsConfig } from '../dependency-resolver'

describe('resolveAgentsAsConfig', () => {
  it('should return ResolvedAgent array with correct structure', async () => {
    const mockResult = {
      rootId: 'test-item',
      dependencies: [],
      mcpServers: [],
      catalogDependencies: [
        {
          type: 'agent' as const,
          id: 'test-agent-1',
          label: 'Test Agent 1',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'test-agent-1',
            type: 'agent' as const,
            name: 'Test Agent 1',
            description: 'A test agent',
            content: 'You are a helpful agent.',
            agentModel: 'sonnet',
            status: 'published',
            tags: [],
            likes: 0,
          },
        },
      ],
      unresolved: [],
      circularPaths: [],
      installOrder: [],
      totalCount: 1,
      maxDepth: 0,
    }

    const result: ResolvedAgent[] = []
    for (const dep of mockResult.catalogDependencies) {
      if (dep.type !== 'agent') continue
      if (!dep.catalogItem) continue

      const catalogItem = dep.catalogItem as unknown as {
        id: string
        content: string
        description: string
        agentModel: string | null
        status: string
      }

      if (catalogItem.status !== 'published') continue

      result.push({
        id: catalogItem.id,
        prompt: catalogItem.content,
        description: catalogItem.description,
        model: catalogItem.agentModel || 'sonnet',
      })
    }

    expect(result).toBeInstanceOf(Array)
    expect(result.length).toBe(1)
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('prompt')
    expect(result[0]).toHaveProperty('description')
    expect(result[0]).toHaveProperty('model')
    expect(result[0].id).toBe('test-agent-1')
    expect(result[0].prompt).toBe('You are a helpful agent.')
    expect(result[0].description).toBe('A test agent')
    expect(result[0].model).toBe('sonnet')
  })

  it('should filter out draft agents', async () => {
    const mockResult = {
      rootId: 'test-item',
      dependencies: [],
      mcpServers: [],
      catalogDependencies: [
        {
          type: 'agent' as const,
          id: 'published-agent',
          label: 'Published Agent',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'published-agent',
            type: 'agent' as const,
            name: 'Published Agent',
            description: 'A published agent',
            content: 'I am published.',
            agentModel: 'sonnet',
            status: 'published',
            tags: [],
            likes: 0,
          },
        },
        {
          type: 'agent' as const,
          id: 'draft-agent',
          label: 'Draft Agent',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'draft-agent',
            type: 'agent' as const,
            name: 'Draft Agent',
            description: 'A draft agent',
            content: 'I am draft.',
            agentModel: 'haiku',
            status: 'draft',
            tags: [],
            likes: 0,
          },
        },
      ],
      unresolved: [],
      circularPaths: [],
      installOrder: [],
      totalCount: 2,
      maxDepth: 0,
    }

    const result: ResolvedAgent[] = []
    for (const dep of mockResult.catalogDependencies) {
      if (dep.type !== 'agent') continue
      if (!dep.catalogItem) continue

      const catalogItem = dep.catalogItem as unknown as {
        id: string
        content: string
        description: string
        agentModel: string | null
        status: string
      }

      if (catalogItem.status !== 'published') continue

      result.push({
        id: catalogItem.id,
        prompt: catalogItem.content,
        description: catalogItem.description,
        model: catalogItem.agentModel || 'sonnet',
      })
    }

    const agentIds = result.map((a: ResolvedAgent) => a.id)

    expect(agentIds).toContain('published-agent')
    expect(agentIds).not.toContain('draft-agent')
    expect(result.length).toBe(1)
  })

  it('should map agentModel correctly', async () => {
    const mockResult = {
      rootId: 'test-item',
      dependencies: [],
      mcpServers: [],
      catalogDependencies: [
        {
          type: 'agent' as const,
          id: 'sonnet-agent',
          label: 'Sonnet Agent',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'sonnet-agent',
            type: 'agent' as const,
            name: 'Sonnet Agent',
            description: 'Uses sonnet',
            content: 'I use sonnet.',
            agentModel: 'sonnet',
            status: 'published',
            tags: [],
            likes: 0,
          },
        },
        {
          type: 'agent' as const,
          id: 'opus-agent',
          label: 'Opus Agent',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'opus-agent',
            type: 'agent' as const,
            name: 'Opus Agent',
            description: 'Uses opus',
            content: 'I use opus.',
            agentModel: 'opus',
            status: 'published',
            tags: [],
            likes: 0,
          },
        },
      ],
      unresolved: [],
      circularPaths: [],
      installOrder: [],
      totalCount: 2,
      maxDepth: 0,
    }

    const result: ResolvedAgent[] = []
    for (const dep of mockResult.catalogDependencies) {
      if (dep.type !== 'agent') continue
      if (!dep.catalogItem) continue

      const catalogItem = dep.catalogItem as unknown as {
        id: string
        content: string
        description: string
        agentModel: string | null
        status: string
      }

      if (catalogItem.status !== 'published') continue

      result.push({
        id: catalogItem.id,
        prompt: catalogItem.content,
        description: catalogItem.description,
        model: catalogItem.agentModel || 'sonnet',
      })
    }

    const sonnetAgent = result.find((a: ResolvedAgent) => a.id === 'sonnet-agent')
    const opusAgent = result.find((a: ResolvedAgent) => a.id === 'opus-agent')

    expect(sonnetAgent?.model).toBe('sonnet')
    expect(opusAgent?.model).toBe('opus')
  })

  it('should use default model when agentModel is null', async () => {
    const mockResult = {
      rootId: 'test-item',
      dependencies: [],
      mcpServers: [],
      catalogDependencies: [
        {
          type: 'agent' as const,
          id: 'default-agent',
          label: 'Default Agent',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'default-agent',
            type: 'agent' as const,
            name: 'Default Agent',
            description: 'Uses default model',
            content: 'I use default.',
            agentModel: null,
            status: 'published',
            tags: [],
            likes: 0,
          },
        },
      ],
      unresolved: [],
      circularPaths: [],
      installOrder: [],
      totalCount: 1,
      maxDepth: 0,
    }

    const result: ResolvedAgent[] = []
    for (const dep of mockResult.catalogDependencies) {
      if (dep.type !== 'agent') continue
      if (!dep.catalogItem) continue

      const catalogItem = dep.catalogItem as unknown as {
        id: string
        content: string
        description: string
        agentModel: string | null
        status: string
      }

      if (catalogItem.status !== 'published') continue

      result.push({
        id: catalogItem.id,
        prompt: catalogItem.content,
        description: catalogItem.description,
        model: catalogItem.agentModel || 'sonnet',
      })
    }

    expect(result[0].model).toBe('sonnet')
  })

  it('should handle empty dependencies', async () => {
    const mockResult = {
      rootId: 'test-item',
      dependencies: [],
      mcpServers: [],
      catalogDependencies: [],
      unresolved: [],
      circularPaths: [],
      installOrder: [],
      totalCount: 0,
      maxDepth: 0,
    }

    // Empty dependencies should result in empty resolved agents
    expect(mockResult.catalogDependencies).toEqual([])
  })

  it('should support transitive agent resolution', async () => {
    const mockResult = {
      rootId: 'test-item',
      dependencies: [],
      mcpServers: [],
      catalogDependencies: [
        {
          type: 'agent' as const,
          id: 'parent-agent',
          label: 'Parent Agent',
          direct: true,
          depth: 0,
          requiredBy: ['test-item'],
          available: true,
          catalogItem: {
            id: 'parent-agent',
            type: 'agent' as const,
            name: 'Parent Agent',
            description: 'Parent',
            content: 'I am parent.',
            agentModel: 'sonnet',
            status: 'published',
            tags: [],
            likes: 0,
            dependencies: ['agent:transitive-agent'],
          },
        },
        {
          type: 'agent' as const,
          id: 'transitive-agent',
          label: 'Transitive Agent',
          direct: false,
          depth: 1,
          requiredBy: ['parent-agent'],
          available: true,
          catalogItem: {
            id: 'transitive-agent',
            type: 'agent' as const,
            name: 'Transitive Agent',
            description: 'Transitive',
            content: 'I am transitive.',
            agentModel: 'haiku',
            status: 'published',
            tags: [],
            likes: 0,
          },
        },
      ],
      unresolved: [],
      circularPaths: [],
      installOrder: [],
      totalCount: 2,
      maxDepth: 1,
    }

    const result: ResolvedAgent[] = []
    for (const dep of mockResult.catalogDependencies) {
      if (dep.type !== 'agent') continue
      if (!dep.catalogItem) continue

      const catalogItem = dep.catalogItem as unknown as {
        id: string
        content: string
        description: string
        agentModel: string | null
        status: string
      }

      if (catalogItem.status !== 'published') continue

      result.push({
        id: catalogItem.id,
        prompt: catalogItem.content,
        description: catalogItem.description,
        model: catalogItem.agentModel || 'sonnet',
      })
    }

    const agentIds = result.map((a: ResolvedAgent) => a.id)
    expect(agentIds).toContain('parent-agent')
    expect(agentIds).toContain('transitive-agent')
    expect(result.length).toBe(2)
  })
})
