/**
 * deploy-skill.test.ts
 *
 * Tests for deploySkill author check removal (EDU-7987 D1).
 * Verifies that any authenticated org member can update an existing skill,
 * not just the original author or an admin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockCatalogItems, mockUsers, mockSuggestions } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  const mockCatalogItems = {
    id: 'id',
    name: 'name',
    type: 'type',
    description: 'description',
    authorId: 'authorId',
    tags: 'tags',
    difficulty: 'difficulty',
    content: 'content',
    readme: 'readme',
    files: 'files',
    dependencies: 'dependencies',
    allowedTools: 'allowedTools',
    agentModel: 'agentModel',
    agentPermissionMode: 'agentPermissionMode',
    agentSkills: 'agentSkills',
    commandArgumentHint: 'commandArgumentHint',
    commandDisableModelInvocation: 'commandDisableModelInvocation',
    version: 'version',
    status: 'status',
    changelog: 'changelog',
    mcpEnabled: 'mcpEnabled',
    likes: 'likes',
    orgId: 'orgId',
    visibility: 'visibility',
    forkCount: 'forkCount',
    embedding: 'embedding',
  }

  const mockUsers = {
    id: 'id',
    name: 'name',
    email: 'email',
  }

  const mockSuggestions = {
    id: 'id',
    pluginId: 'pluginId',
    title: 'title',
    description: 'description',
    diff: 'diff',
    status: 'status',
    suggestedBy: 'suggestedBy',
    suggestedByName: 'suggestedByName',
    resolvedBy: 'resolvedBy',
    resolvedAt: 'resolvedAt',
    resolveComment: 'resolveComment',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  return { mockDb, mockCatalogItems, mockUsers, mockSuggestions }
})

vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: mockCatalogItems,
  users: mockUsers,
  suggestions: mockSuggestions,
}))

vi.mock('drizzle-orm', () => ({
  ilike: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../../../../packages/lib/src/plugin/dependency-resolver', () => ({
  resolveAgentsAsConfig: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../../packages/lib/src/security/rbac', () => ({
  isSuperAdmin: vi.fn().mockReturnValue(false),
}))

vi.mock('../../../../packages/lib/src/notifications/slack', () => ({
  notifySlackDeploy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../packages/lib/src/versioning/version', () => ({
  determineVersion: vi.fn().mockReturnValue({
    version: '1.1.0',
    changelog: 'updated by collaborator',
  }),
  generateIdFromName: vi.fn().mockImplementation((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-')
  ),
  hasUpdate: vi.fn().mockImplementation((installed: string, latest: string) =>
    installed !== latest
  ),
  incrementVersion: vi.fn().mockImplementation((version: string) => {
    const [major, minor, patch] = version.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }),
}))

vi.mock('../../../../packages/lib/src/versioning/skill-version', () => ({
  createVersionSnapshot: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../packages/lib/src/search/embedding', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
  prepareTextForEmbedding: vi.fn().mockReturnValue(''),
}))

vi.mock('../../../../packages/lib/src/search/vector-search', () => ({
  semanticSearch: vi.fn().mockResolvedValue({ items: [], total: 0, searchTime: 0 }),
}))

vi.mock('../../../../packages/lib/src/utils', () => ({
  getBaseUrl: vi.fn().mockReturnValue('https://ai-toolkit.gpters.org'),
}))

const db = mockDb

import { deploySkill } from '@/lib/mcp/handlers'

/** Helper: create a fluent mock chain that resolves with the given rows */
function createMockChain(result: unknown[] = []) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
}

describe('deploySkill — author check removed (EDU-7987 D1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets a non-author org member update an existing skill', async () => {
    // Existing skill owned by 'original-author' in org-1
    const mockSelectChain = createMockChain([
      { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-1' },
    ])
    const mockUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
    vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

    // 'collaborator-id' is NOT the authorId, but is in the same org
    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
        changelog: 'updated by collaborator',
      },
      'collaborator-id',
      'editor',
      'org-1'
    )

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(db.update).toHaveBeenCalled()
  })

  it('still blocks unauthenticated updates (no authorId)', async () => {
    const mockSelectChain = createMockChain([
      { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-1' },
    ])
    vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

    // Pass undefined as authorId to simulate unauthenticated caller
    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
      },
      undefined,
      'editor',
      'org-1'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('인증이 필요합니다')
  })

  it('blocks cross-org updates', async () => {
    // Existing skill belongs to org-A
    const mockSelectChain = createMockChain([
      { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-A' },
    ])
    vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

    // Caller is from org-B (not super_admin)
    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
      },
      'other-org-user',
      'editor',
      'org-B'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('다른 조직')
  })
})
