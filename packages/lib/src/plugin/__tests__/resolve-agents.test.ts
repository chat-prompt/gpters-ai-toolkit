import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db, catalogItems } from '@gpters/db'
import { eq } from 'drizzle-orm'
import { resolveAgentsAsConfig } from '../dependency-resolver'

describe('resolveAgentsAsConfig', () => {
  const testAgentId = 'test-agent-1'
  const testAgentId2 = 'test-agent-2'
  const testDraftAgentId = 'test-draft-agent'
  const testSkillId = 'test-skill-1'
  const testItemId = 'test-item-with-agents'

  beforeAll(async () => {
    await db.insert(catalogItems).values([
      {
        id: testAgentId,
        type: 'agent' as const,
        name: 'Test Agent 1',
        description: 'A test agent for resolution',
        content: 'You are a helpful test agent.',
        agentModel: 'sonnet',
        agentPermissionMode: 'default',
        status: 'published',
      },
      {
        id: testAgentId2,
        type: 'agent' as const,
        name: 'Test Agent 2',
        description: 'Another test agent',
        content: 'You are another helpful agent.',
        agentModel: 'opus',
        agentPermissionMode: 'acceptEdits',
        status: 'published',
      },
      {
        id: testDraftAgentId,
        type: 'agent' as const,
        name: 'Draft Agent',
        description: 'A draft agent that should not be resolved',
        content: 'You are a draft agent.',
        agentModel: 'haiku',
        agentPermissionMode: 'default',
        status: 'draft',
      },
      {
        id: testSkillId,
        type: 'skill' as const,
        name: 'Test Skill',
        description: 'A test skill',
        content: 'This is a test skill.',
        status: 'published',
      },
      {
        id: testItemId,
        type: 'skill' as const,
        name: 'Item with Agent Dependencies',
        description: 'An item that depends on agents',
        content: 'This item has agent dependencies.',
        status: 'published',
        dependencies: [
          `agent:${testAgentId}`,
          `agent:${testAgentId2}`,
          `agent:${testDraftAgentId}`,
          `skill:${testSkillId}`,
        ],
      },
    ])
  })

  afterAll(async () => {
    await db.delete(catalogItems).where(eq(catalogItems.id, testAgentId))
    await db.delete(catalogItems).where(eq(catalogItems.id, testAgentId2))
    await db.delete(catalogItems).where(eq(catalogItems.id, testDraftAgentId))
    await db.delete(catalogItems).where(eq(catalogItems.id, testSkillId))
    await db.delete(catalogItems).where(eq(catalogItems.id, testItemId))
  })

  it('should resolve agent dependencies to ResolvedAgent format', async () => {
    const resolved = await resolveAgentsAsConfig(testItemId)

    expect(resolved).toBeInstanceOf(Array)
    expect(resolved.length).toBeGreaterThan(0)

    for (const agent of resolved) {
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('prompt')
      expect(agent).toHaveProperty('description')
      expect(agent).toHaveProperty('model')
      expect(typeof agent.id).toBe('string')
      expect(typeof agent.prompt).toBe('string')
      expect(typeof agent.description).toBe('string')
      expect(typeof agent.model).toBe('string')
    }
  })

  it('should only include published agents', async () => {
    const resolved = await resolveAgentsAsConfig(testItemId)

    const agentIds = resolved.map((a: { id: string }) => a.id)

    expect(agentIds).toContain(testAgentId)
    expect(agentIds).toContain(testAgentId2)
    expect(agentIds).not.toContain(testDraftAgentId)
  })

  it('should map agentModel to model field correctly', async () => {
    const resolved = await resolveAgentsAsConfig(testItemId)

    const agent1 = resolved.find((a: { id: string }) => a.id === testAgentId)
    const agent2 = resolved.find((a: { id: string }) => a.id === testAgentId2)

    expect(agent1?.model).toBe('sonnet')
    expect(agent2?.model).toBe('opus')
  })

  it('should include agent content as prompt', async () => {
    const resolved = await resolveAgentsAsConfig(testItemId)

    const agent1 = resolved.find((a: { id: string }) => a.id === testAgentId)

    expect(agent1?.prompt).toBe('You are a helpful test agent.')
  })

  it('should include agent description', async () => {
    const resolved = await resolveAgentsAsConfig(testItemId)

    const agent1 = resolved.find((a: { id: string }) => a.id === testAgentId)

    expect(agent1?.description).toBe('A test agent for resolution')
  })

  it('should return empty array for item with no agent dependencies', async () => {
    const resolved = await resolveAgentsAsConfig(testSkillId)

    expect(resolved).toEqual([])
  })

  it('should throw error for non-existent item', async () => {
    await expect(resolveAgentsAsConfig('non-existent-item')).rejects.toThrow()
  })

  it('should support transitive agent resolution', async () => {
    const transitiveAgentId = 'transitive-agent'
    const parentAgentId = 'parent-agent'
    const transitiveItemId = 'transitive-item'

    try {
      await db.insert(catalogItems).values([
        {
          id: transitiveAgentId,
          type: 'agent' as const,
          name: 'Transitive Agent',
          description: 'An agent in transitive chain',
          content: 'I am a transitive agent.',
          agentModel: 'haiku',
          agentPermissionMode: 'default',
          status: 'published',
        },
        {
          id: parentAgentId,
          type: 'agent' as const,
          name: 'Parent Agent',
          description: 'An agent that depends on another agent',
          content: 'I am a parent agent.',
          agentModel: 'sonnet',
          agentPermissionMode: 'default',
          status: 'published',
          dependencies: [`agent:${transitiveAgentId}`],
        },
        {
          id: transitiveItemId,
          type: 'skill' as const,
          name: 'Item with Transitive Agent',
          description: 'Item with transitive agent dependency',
          content: 'This item has transitive agent dependencies.',
          status: 'published',
          dependencies: [`agent:${parentAgentId}`],
        },
      ])

      const resolved = await resolveAgentsAsConfig(transitiveItemId)

      const agentIds = resolved.map((a: { id: string }) => a.id)
      expect(agentIds).toContain(parentAgentId)
      expect(agentIds).toContain(transitiveAgentId)
    } finally {
      await db.delete(catalogItems).where(eq(catalogItems.id, transitiveAgentId))
      await db.delete(catalogItems).where(eq(catalogItems.id, parentAgentId))
      await db.delete(catalogItems).where(eq(catalogItems.id, transitiveItemId))
    }
  })
})
