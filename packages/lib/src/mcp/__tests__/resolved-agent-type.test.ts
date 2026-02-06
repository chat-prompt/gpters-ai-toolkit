/**
 * Tests for ResolvedAgent type definition
 *
 * Verifies that the ResolvedAgent interface is properly defined
 * with all required fields for subagent resolution.
 */

import { describe, it, expect } from 'vitest'
import type { ResolvedAgent } from '../types'

describe('ResolvedAgent type', () => {
  it('should have all required fields', () => {
    const agent: ResolvedAgent = {
      id: 'test-agent',
      prompt: 'You are a helpful assistant',
      description: 'A test agent for demonstration',
      model: 'sonnet',
    }

    expect(agent).toHaveProperty('id')
    expect(agent).toHaveProperty('prompt')
    expect(agent).toHaveProperty('description')
    expect(agent).toHaveProperty('model')
  })

  it('should accept valid agent configuration', () => {
    const agent: ResolvedAgent = {
      id: 'code-reviewer',
      prompt: 'Review code for quality and best practices',
      description: 'Analyzes code and provides constructive feedback',
      model: 'opus',
    }

    expect(agent.id).toBe('code-reviewer')
    expect(agent.prompt).toBe('Review code for quality and best practices')
    expect(agent.description).toBe('Analyzes code and provides constructive feedback')
    expect(agent.model).toBe('opus')
  })

  it('should work with different model types', () => {
    const models = ['sonnet', 'opus', 'haiku', 'inherit'] as const

    models.forEach((model) => {
      const agent: ResolvedAgent = {
        id: `agent-${model}`,
        prompt: `Agent using ${model}`,
        description: `Test agent with ${model} model`,
        model,
      }

      expect(agent.model).toBe(model)
    })
  })

  it('should enforce string types for all fields', () => {
    const agent: ResolvedAgent = {
      id: 'string-test',
      prompt: 'string prompt',
      description: 'string description',
      model: 'sonnet',
    }

    expect(typeof agent.id).toBe('string')
    expect(typeof agent.prompt).toBe('string')
    expect(typeof agent.description).toBe('string')
    expect(typeof agent.model).toBe('string')
  })
})
