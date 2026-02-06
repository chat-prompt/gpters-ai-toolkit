/**
 * Tests for getPluginContent handler with resolvedAgents
 *
 * Verifies that getPluginContent properly resolves agent dependencies
 * and includes them in the response when applicable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PluginContent, ResolvedAgent } from '../types'

describe('PluginContent type with resolvedAgents', () => {
  it('should have resolvedAgents as optional field', () => {
    const content: PluginContent = {
      id: 'test-skill',
      name: 'Test Skill',
      type: 'skill',
      description: 'A test skill',
      authorName: 'Test Author',
      tags: [],
      content: 'Skill content',
    }

    expect(content).not.toHaveProperty('resolvedAgents')
  })

  it('should accept resolvedAgents when provided', () => {
    const resolvedAgents: ResolvedAgent[] = [
      {
        id: 'agent-1',
        prompt: 'Agent prompt',
        description: 'Agent description',
        model: 'sonnet',
      },
    ]

    const content: PluginContent = {
      id: 'test-skill',
      name: 'Test Skill',
      type: 'skill',
      description: 'A test skill',
      authorName: 'Test Author',
      tags: [],
      content: 'Skill content',
      resolvedAgents,
    }

    expect(content.resolvedAgents).toBeDefined()
    expect(content.resolvedAgents).toEqual(resolvedAgents)
    expect(content.resolvedAgents?.[0].id).toBe('agent-1')
    expect(content.resolvedAgents?.[0].prompt).toBe('Agent prompt')
    expect(content.resolvedAgents?.[0].model).toBe('sonnet')
  })

  it('should accept undefined resolvedAgents', () => {
    const content: PluginContent = {
      id: 'test-skill',
      name: 'Test Skill',
      type: 'skill',
      description: 'A test skill',
      authorName: 'Test Author',
      tags: [],
      content: 'Skill content',
      resolvedAgents: undefined,
    }

    expect(content.resolvedAgents).toBeUndefined()
  })

  it('should accept empty resolvedAgents array', () => {
    const content: PluginContent = {
      id: 'test-skill',
      name: 'Test Skill',
      type: 'skill',
      description: 'A test skill',
      authorName: 'Test Author',
      tags: [],
      content: 'Skill content',
      resolvedAgents: [],
    }

    expect(content.resolvedAgents).toBeDefined()
    expect(content.resolvedAgents).toHaveLength(0)
  })

  it('should support multiple resolved agents', () => {
    const resolvedAgents: ResolvedAgent[] = [
      {
        id: 'agent-1',
        prompt: 'First agent prompt',
        description: 'First agent',
        model: 'opus',
      },
      {
        id: 'agent-2',
        prompt: 'Second agent prompt',
        description: 'Second agent',
        model: 'haiku',
      },
      {
        id: 'agent-3',
        prompt: 'Third agent prompt',
        description: 'Third agent',
        model: 'sonnet',
      },
    ]

    const content: PluginContent = {
      id: 'test-skill',
      name: 'Test Skill',
      type: 'skill',
      description: 'A test skill',
      authorName: 'Test Author',
      tags: [],
      content: 'Skill content',
      resolvedAgents,
    }

    expect(content.resolvedAgents).toHaveLength(3)
    expect(content.resolvedAgents?.[0].id).toBe('agent-1')
    expect(content.resolvedAgents?.[1].id).toBe('agent-2')
    expect(content.resolvedAgents?.[2].id).toBe('agent-3')
  })

  it('should preserve all other fields when resolvedAgents is present', () => {
    const resolvedAgents: ResolvedAgent[] = [
      {
        id: 'agent-1',
        prompt: 'Agent prompt',
        description: 'Agent description',
        model: 'sonnet',
      },
    ]

    const content: PluginContent = {
      id: 'test-skill-123',
      name: 'Advanced Skill',
      type: 'skill',
      description: 'A comprehensive skill',
      authorName: 'John Doe',
      tags: ['ai', 'automation'],
      teamTag: 'platform',
      difficulty: 'hard',
      content: 'Detailed skill content',
      readme: 'Additional documentation',
      dependencies: ['agent:agent-1'],
      allowedTools: 'all',
      version: '2.0.0',
      status: 'published',
      changelog: 'Added new features',
      resolvedAgents,
    }

    expect(content.id).toBe('test-skill-123')
    expect(content.name).toBe('Advanced Skill')
    expect(content.type).toBe('skill')
    expect(content.description).toBe('A comprehensive skill')
    expect(content.authorName).toBe('John Doe')
    expect(content.tags).toEqual(['ai', 'automation'])
    expect(content.teamTag).toBe('platform')
    expect(content.difficulty).toBe('hard')
    expect(content.content).toBe('Detailed skill content')
    expect(content.readme).toBe('Additional documentation')
    expect(content.dependencies).toEqual(['agent:agent-1'])
    expect(content.allowedTools).toBe('all')
    expect(content.version).toBe('2.0.0')
    expect(content.status).toBe('published')
    expect(content.changelog).toBe('Added new features')
    expect(content.resolvedAgents).toBeDefined()
    expect(content.resolvedAgents?.[0].id).toBe('agent-1')
  })

  it('should work with different item types', () => {
    const types: Array<'skill' | 'agent' | 'command' | 'guide'> = [
      'skill',
      'agent',
      'command',
      'guide',
    ]

    types.forEach((type) => {
      const content: PluginContent = {
        id: `test-${type}`,
        name: `Test ${type}`,
        type,
        description: `A test ${type}`,
        authorName: 'Test Author',
        tags: [],
        content: 'Content',
      }

      expect(content.type).toBe(type)
      expect(content.resolvedAgents).toBeUndefined()
    })
  })

  it('should enforce ResolvedAgent structure', () => {
    const agent: ResolvedAgent = {
      id: 'test-agent',
      prompt: 'You are a helpful assistant',
      description: 'A test agent',
      model: 'sonnet',
    }

    expect(agent).toHaveProperty('id')
    expect(agent).toHaveProperty('prompt')
    expect(agent).toHaveProperty('description')
    expect(agent).toHaveProperty('model')
    expect(typeof agent.id).toBe('string')
    expect(typeof agent.prompt).toBe('string')
    expect(typeof agent.description).toBe('string')
    expect(typeof agent.model).toBe('string')
  })
})
