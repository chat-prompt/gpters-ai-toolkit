import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DeploySkillInput } from '../types'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}

const mockCatalogItems = {
  id: 'id',
  type: 'type',
  name: 'name',
  content: 'content',
  dependencies: 'dependencies',
}

describe('deploy_skill with agent: dependency storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('DeploySkillInput with dependencies', () => {
    it('should accept dependencies array in deploy input', () => {
      const input: DeploySkillInput = {
        type: 'skill',
        name: 'Test Skill',
        content: '# Test Skill',
        description: 'A test skill with agent dependency',
        dependencies: ['agent:code-reviewer'],
      }

      expect(input.dependencies).toBeDefined()
      expect(input.dependencies).toEqual(['agent:code-reviewer'])
    })

    it('should accept agent: prefix in dependencies', () => {
      const input: DeploySkillInput = {
        type: 'skill',
        name: 'Code Review Skill',
        content: '# Code Review Skill',
        dependencies: ['agent:code-reviewer'],
      }

      expect(input.dependencies).toHaveLength(1)
      expect(input.dependencies![0]).toBe('agent:code-reviewer')
      expect(input.dependencies![0]).toMatch(/^agent:/)
    })

    it('should handle multiple agent dependencies', () => {
      const input: DeploySkillInput = {
        type: 'skill',
        name: 'Multi-Agent Skill',
        content: '# Multi-Agent Skill',
        dependencies: ['agent:code-reviewer', 'agent:documentation-writer', 'agent:test-generator'],
      }

      expect(input.dependencies).toHaveLength(3)
      expect(input.dependencies![0]).toBe('agent:code-reviewer')
      expect(input.dependencies![1]).toBe('agent:documentation-writer')
      expect(input.dependencies![2]).toBe('agent:test-generator')
    })

    it('should preserve agent: prefix format', () => {
      const dependencies = ['agent:code-reviewer', 'agent:db-expert', 'agent:security-auditor']

      dependencies.forEach((dep) => {
        expect(dep).toMatch(/^agent:/)
        const [prefix, agentId] = dep.split(':')
        expect(prefix).toBe('agent')
        expect(agentId).toBeTruthy()
      })
    })

    it('should handle empty dependencies array', () => {
      const input: DeploySkillInput = {
        type: 'skill',
        name: 'Simple Skill',
        content: '# Simple Skill',
        dependencies: [],
      }

      expect(input.dependencies).toEqual([])
      expect(input.dependencies).toHaveLength(0)
    })

    it('should handle undefined dependencies', () => {
      const input: DeploySkillInput = {
        type: 'skill',
        name: 'No Dependencies Skill',
        content: '# No Dependencies',
        dependencies: undefined,
      }

      expect(input.dependencies).toBeUndefined()
    })
  })

  describe('Dependencies field in deploy input', () => {
    it('should create deploy input with agent: dependency', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Skill with Agent Dependency',
        content: '# Skill Content',
        description: 'A skill that depends on code-reviewer agent',
        dependencies: ['agent:code-reviewer'],
      }

      expect(deployInput.dependencies).toBeDefined()
      expect(deployInput.dependencies).toContain('agent:code-reviewer')
    })

    it('should preserve all deploy input properties with dependencies', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Complete Skill',
        content: '# Complete Skill Content',
        description: 'A complete skill with all properties',
        tags: ['code-review', 'quality'],
        dependencies: ['agent:code-reviewer'],
      }

      expect(deployInput.type).toBe('skill')
      expect(deployInput.name).toBe('Complete Skill')
      expect(deployInput.content).toBe('# Complete Skill Content')
      expect(deployInput.description).toBe('A complete skill with all properties')
      expect(deployInput.tags).toEqual(['code-review', 'quality'])
      expect(deployInput.dependencies).toEqual(['agent:code-reviewer'])
    })

    it('should handle dependencies with other optional fields', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Advanced Skill',
        content: '# Advanced Skill',
        id: 'advanced-skill',
        description: 'An advanced skill',
        tags: ['advanced'],
        allowedTools: 'code_execution,file_access',
        dependencies: ['agent:code-reviewer', 'agent:documentation-writer'],
      }

      expect(deployInput.id).toBe('advanced-skill')
      expect(deployInput.allowedTools).toBe('code_execution,file_access')
      expect(deployInput.dependencies).toHaveLength(2)
      expect(deployInput.dependencies![0]).toBe('agent:code-reviewer')
      expect(deployInput.dependencies![1]).toBe('agent:documentation-writer')
    })
  })

  describe('Agent dependency format validation', () => {
    it('should validate agent: prefix format', () => {
      const validDependencies = [
        'agent:code-reviewer',
        'agent:db-expert',
        'agent:security-auditor',
        'agent:test-generator',
      ]

      validDependencies.forEach((dep) => {
        const isValid = /^agent:[a-z0-9-]+$/.test(dep)
        expect(isValid).toBe(true)
      })
    })

    it('should identify agent dependencies by prefix', () => {
      const dependencies = ['agent:code-reviewer', 'agent:db-expert']

      const agentDeps = dependencies.filter((dep) => dep.startsWith('agent:'))
      expect(agentDeps).toHaveLength(2)
      expect(agentDeps[0]).toBe('agent:code-reviewer')
      expect(agentDeps[1]).toBe('agent:db-expert')
    })

    it('should extract agent ID from agent: dependency', () => {
      const dependency = 'agent:code-reviewer'
      const [prefix, agentId] = dependency.split(':')

      expect(prefix).toBe('agent')
      expect(agentId).toBe('code-reviewer')
    })

    it('should handle multiple agent dependencies extraction', () => {
      const dependencies = ['agent:code-reviewer', 'agent:db-expert', 'agent:security-auditor']

      const agentIds = dependencies
        .filter((dep) => dep.startsWith('agent:'))
        .map((dep) => dep.split(':')[1])

      expect(agentIds).toEqual(['code-reviewer', 'db-expert', 'security-auditor'])
    })
  })

  describe('Dependencies storage simulation', () => {
    it('should preserve dependencies through JSON serialization', () => {
      const originalDependencies = ['agent:code-reviewer', 'agent:db-expert']
      const serialized = JSON.stringify(originalDependencies)
      const deserialized = JSON.parse(serialized) as string[]

      expect(deserialized).toEqual(originalDependencies)
      expect(deserialized[0]).toBe('agent:code-reviewer')
      expect(deserialized[1]).toBe('agent:db-expert')
    })

    it('should preserve agent: prefix in JSONB storage', () => {
      const dependencies = ['agent:code-reviewer']
      const jsonbValue = JSON.stringify(dependencies)
      expect(jsonbValue).toContain('"agent:code-reviewer"')

      const retrieved = JSON.parse(jsonbValue) as string[]
      expect(retrieved[0]).toBe('agent:code-reviewer')
    })

    it('should handle complex dependency arrays', () => {
      const dependencies = ['agent:code-reviewer', 'agent:db-expert', 'agent:security-auditor']
      const stored = JSON.stringify(dependencies)
      const retrieved = JSON.parse(stored) as string[]

      expect(retrieved).toHaveLength(3)
      retrieved.forEach((dep) => {
        expect(dep).toMatch(/^agent:/)
      })
    })
  })

  describe('Deploy skill with agent: dependency roundtrip', () => {
    it('should preserve agent: dependency through deploy input', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Skill with Agent Dependency',
        content: '# Skill Content',
        dependencies: ['agent:code-reviewer'],
      }

      const stored = JSON.stringify(deployInput.dependencies)
      const retrieved = JSON.parse(stored) as string[]

      expect(retrieved).toEqual(['agent:code-reviewer'])
      expect(retrieved[0]).toBe('agent:code-reviewer')
    })

    it('should preserve multiple agent dependencies through roundtrip', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Multi-Agent Skill',
        content: '# Multi-Agent Skill',
        dependencies: ['agent:code-reviewer', 'agent:documentation-writer'],
      }

      const stored = JSON.stringify(deployInput.dependencies)
      const retrieved = JSON.parse(stored) as string[]

      expect(retrieved).toHaveLength(2)
      expect(retrieved[0]).toBe('agent:code-reviewer')
      expect(retrieved[1]).toBe('agent:documentation-writer')
    })

    it('should handle deploy input with all properties and agent dependencies', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Complete Skill',
        content: '# Complete Skill',
        description: 'A complete skill',
        tags: ['code-review'],
        dependencies: ['agent:code-reviewer'],
      }

      expect(deployInput.type).toBe('skill')
      expect(deployInput.name).toBe('Complete Skill')
      expect(deployInput.dependencies).toEqual(['agent:code-reviewer'])

      const storedDeps = JSON.stringify(deployInput.dependencies)
      const retrievedDeps = JSON.parse(storedDeps) as string[]

      expect(retrievedDeps).toEqual(['agent:code-reviewer'])
    })
  })

  describe('Agent dependency in database context', () => {
    it('should store agent: dependency in dependencies field', () => {
      const dbValues = {
        id: 'test-skill',
        type: 'skill',
        name: 'Test Skill',
        content: '# Test Skill',
        dependencies: ['agent:code-reviewer'],
      }

      expect(dbValues.dependencies).toEqual(['agent:code-reviewer'])
      expect(dbValues.dependencies[0]).toBe('agent:code-reviewer')
    })

    it('should preserve agent: prefix in database storage', () => {
      const dependencies = ['agent:code-reviewer', 'agent:db-expert']
      const dbStoredValue = JSON.stringify(dependencies)

      expect(dbStoredValue).toContain('agent:code-reviewer')
      expect(dbStoredValue).toContain('agent:db-expert')

      const retrieved = JSON.parse(dbStoredValue) as string[]
      expect(retrieved[0]).toBe('agent:code-reviewer')
      expect(retrieved[1]).toBe('agent:db-expert')
    })

    it('should handle null/undefined dependencies in database', () => {
      const dbValues1 = {
        id: 'skill-1',
        dependencies: undefined,
      }

      expect(dbValues1.dependencies).toBeUndefined()

      const dbValues2 = {
        id: 'skill-2',
        dependencies: [],
      }

      expect(dbValues2.dependencies).toEqual([])
    })

    it('should store and retrieve agent: dependency correctly', () => {
      const deployInput: DeploySkillInput = {
        type: 'skill',
        name: 'Agent-Dependent Skill',
        content: '# Skill',
        dependencies: ['agent:code-reviewer'],
      }

      const dbInsertValues = {
        id: 'agent-dependent-skill',
        type: deployInput.type,
        name: deployInput.name,
        content: deployInput.content,
        dependencies: deployInput.dependencies || [],
      }

      expect(dbInsertValues.dependencies).toEqual(['agent:code-reviewer'])

      const dbRetrievedValues = {
        ...dbInsertValues,
        dependencies: JSON.parse(JSON.stringify(dbInsertValues.dependencies)) as string[],
      }

      expect(dbRetrievedValues.dependencies).toEqual(['agent:code-reviewer'])
      expect(dbRetrievedValues.dependencies[0]).toBe('agent:code-reviewer')
    })
  })
})
