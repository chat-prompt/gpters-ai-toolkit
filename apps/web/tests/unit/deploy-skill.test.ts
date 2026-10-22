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
  orgMemberships: { userId: 'userId', orgId: 'orgId', status: 'status' },
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
  analyzeChanges: vi.fn().mockReturnValue({
    hasChanges: true,
    breaking: false,
    newFeatures: false,
    summary: 'content changed',
  }),
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
import { eq } from 'drizzle-orm'
import { determineVersion } from '../../../../packages/lib/src/versioning/version'
import { analyzeChanges, createVersionSnapshot } from '../../../../packages/lib/src/versioning/skill-version'
import { notifySlackDeploy } from '../../../../packages/lib/src/notifications/slack'
import { prepareTextForEmbedding } from '../../../../packages/lib/src/search/embedding'

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

  it('denies an agent updating another owner asset even in the same organization', async () => {
    vi.mocked(db.select).mockReturnValue(createMockChain([
      { id: 'sample-skill', content: 'old', version: '1.0.0', authorId: 'other-owner', orgId: 'org-1' },
    ]) as never)
    const result = await deploySkill({ id: 'sample-skill', type: 'skill', name: 'Sample', content: 'new' }, 'agent-owner', 'viewer', 'org-1', true)
    expect(result.success).toBe(false)
    expect(result.error).toContain('limited to assets owned by its owner')
    expect(db.update).not.toHaveBeenCalled()
  })

  it('fails an agent ownership race before snapshots or deployment side effects', async () => {
    vi.mocked(db.select).mockReturnValue(createMockChain([
      { id: 'sample-skill', content: 'old', version: '1.0.0', authorId: 'agent-owner', orgId: 'org-1' },
    ]) as never)
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) }
    vi.mocked(db.update).mockReturnValue(updateChain as never)
    const result = await deploySkill({ id: 'sample-skill', type: 'skill', name: 'Sample', content: 'new', changelog: 'Update' }, 'agent-owner', 'viewer', 'org-1', true)
    expect(result.success).toBe(false)
    expect(result.error).toContain('ownership changed')
    expect(db.select).toHaveBeenCalledTimes(1)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('lets an org-scope agent update another author asset in its organization, guarding only the org', async () => {
    vi.mocked(db.select).mockReturnValue(createMockChain([
      { id: 'sample-skill', content: 'old', version: '1.0.0', authorId: 'other-owner', orgId: 'org-1' },
    ]) as never)
    const updated = { id: 'sample-skill', name: 'Sample', content: 'new', version: '1.0.1', authorId: 'other-owner', orgId: 'org-1' }
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([updated]) }
    vi.mocked(db.update).mockReturnValue(updateChain as never)
    const result = await deploySkill({ id: 'sample-skill', type: 'skill', name: 'Sample', content: 'new', changelog: 'Update' },
      'agent-owner', 'viewer', 'org-1', { scope: 'org', id: 'bbojjak' })
    expect(result.success).toBe(true)
    // 작성자는 바꾸지 않는다 — update에 authorId를 넣지 않는다
    expect(updateChain.set).toHaveBeenCalledWith(expect.not.objectContaining({ authorId: expect.anything() }))
    // 쓰는 시점에 조직만 다시 건다 (작성자 조건은 없다)
    expect(eq).toHaveBeenCalledWith(mockCatalogItems.orgId, 'org-1')
    expect(eq).not.toHaveBeenCalledWith(mockCatalogItems.authorId, 'agent-owner')
  })

  it('fails an org-scope agent when the asset leaves its organization between the check and the write', async () => {
    vi.mocked(db.select).mockReturnValue(createMockChain([
      { id: 'sample-skill', content: 'old', version: '1.0.0', authorId: 'other-owner', orgId: 'org-1' },
    ]) as never)
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) }
    vi.mocked(db.update).mockReturnValue(updateChain as never)
    const result = await deploySkill({ id: 'sample-skill', type: 'skill', name: 'Sample', content: 'new', changelog: 'Update' },
      'agent-owner', 'viewer', 'org-1', { scope: 'org', id: 'bbojjak' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('ownership changed')
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  it('denies an org-scope agent on an asset of another organization or without an organization', async () => {
    for (const orgId of ['org-2', null]) {
      vi.mocked(db.select).mockReturnValue(createMockChain([
        { id: 'sample-skill', content: 'old', version: '1.0.0', authorId: 'other-owner', orgId },
      ]) as never)
      const result = await deploySkill({ id: 'sample-skill', type: 'skill', name: 'Sample', content: 'new' },
        'agent-owner', 'viewer', 'org-1', { scope: 'org', id: 'bbojjak' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('limited to assets in the authorized organization')
    }
    expect(db.update).not.toHaveBeenCalled()
  })

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

  it('lets a member of several orgs update when the request resolved to another org', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(createMockChain([
        { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-A' },
      ]) as never)
      .mockReturnValueOnce(createMockChain([{ orgId: 'org-A' }]) as never)
      .mockReturnValue(createMockChain([]) as never)
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    } as never)

    const result = await deploySkill(
      { id: 'sample-skill', type: 'skill', name: 'Sample', content: 'new content', changelog: 'Update' },
      'multi-org-user',
      'viewer',
      'org-B'
    )

    expect(result.success).toBe(true)
    expect(db.update).toHaveBeenCalled()
  })

  it('blocks cross-org updates', async () => {
    // Existing skill belongs to org-A; caller has no active membership there
    vi.mocked(db.select)
      .mockReturnValueOnce(createMockChain([
        { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-A' },
      ]) as never)
      .mockReturnValueOnce(createMockChain([]) as never)

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

describe('deploySkill — changelog enforcement (EDU-7987 D3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects update without changelog', async () => {
    const mockSelectChain = createMockChain([
      { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-1' },
    ])
    vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
        // no changelog
      },
      'collaborator-id',
      'editor',
      'org-1'
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('changelog')
  })

  it('rejects update with whitespace-only changelog', async () => {
    const mockSelectChain = createMockChain([
      { id: 'sample-skill', content: 'old content', version: '1.0.0', authorId: 'original-author', files: null, orgId: 'org-1' },
    ])
    vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
        changelog: '   ',
      },
      'collaborator-id',
      'editor',
      'org-1'
    )
    expect(result.success).toBe(false)
  })

  it('auto-fills "Initial release" for new deployments', async () => {
    // Override mock: existing returns [] (brand new skill)
    const mockSelectChain = createMockChain([])
    vi.mocked(db.select).mockReturnValueOnce(mockSelectChain as never)

    const mockInsertChain = {
      values: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

    // Override determineVersion to reflect the auto-filled "Initial release" changelog
    vi.mocked(determineVersion).mockReturnValueOnce({
      version: '1.0.0',
      type: 'none',
      changelog: 'Initial release',
    })

    const result = await deploySkill(
      {
        id: 'brand-new',
        type: 'skill',
        name: 'New Skill',
        content: 'hello',
        description: 'desc',
        tags: ['x'],
        // no changelog
      },
      'collaborator-id',
      'editor',
      'org-1'
    )
    expect(result.success).toBe(true)
    expect(result.changelog).toBe('Initial release')
    expect(determineVersion).toHaveBeenCalledWith(null, expect.anything(), 'Initial release')
  })
})

describe('deploySkill — 생략한 필드 보존과 변경 없는 재배포 알림 (2026-10-22)', () => {
  beforeEach(() => vi.clearAllMocks())

  const existingRow = {
    id: 'sample-skill', content: 'same', version: '1.0.19', authorId: 'author', orgId: 'org-1', name: 'Sample',
    description: '기존 설명', tags: ['ax'], status: 'published',
    files: [{ type: 'reference', content: 'x', name: 'a.md' }],
  }

  /** 본문이 같은 업데이트를 돌리고 set 인자를 돌려준다 */
  async function deployUnchangedContent(input: Record<string, unknown>) {
    vi.mocked(analyzeChanges).mockReturnValueOnce({ hasChanges: false, breaking: false, newFeatures: false, summary: 'No changes' })
    vi.mocked(determineVersion).mockReturnValueOnce({ version: '1.0.19', type: 'none', changelog: 'No changes' })
    vi.mocked(db.select).mockReturnValue(createMockChain([existingRow]) as never)
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(db.update).mockReturnValue(updateChain as never)
    const result = await deploySkill({ id: 'sample-skill', type: 'skill', name: 'Sample', content: 'same', ...input } as never,
      'author', 'editor', 'org-1')
    await new Promise((resolve) => setTimeout(resolve, 0))
    return { result, set: updateChain.set.mock.calls[0][0] }
  }

  it('설명·태그를 보내지 않으면 기존 값을 지우지 않는다', async () => {
    const { set } = await deployUnchangedContent({ files: [{ name: 'a.md', content: 'y', type: 'reference' }] })
    expect(set).not.toHaveProperty('description')
    expect(set).not.toHaveProperty('tags')
    // 검색 임베딩도 남은 설명·태그로 만든다
    expect(prepareTextForEmbedding).toHaveBeenCalledWith(expect.objectContaining({ description: '기존 설명', tags: ['ax'] }))
  })

  it('status 를 보내지 않으면 draft 항목을 published 로 바꾸지 않는다', async () => {
    existingRow.status = 'draft'
    try {
      const { set } = await deployUnchangedContent({ description: '새 설명' })
      expect(set).toMatchObject({ status: 'draft', mcpEnabled: false })
    } finally {
      existingRow.status = 'published'
    }
  })

  it('아무것도 안 바뀐 재배포는 알림·스냅샷·changelog 를 건드리지 않는다', async () => {
    // files 는 jsonb 가 키 순서를 바꿔 돌려줘도 같은 값으로 본다
    const { result, set } = await deployUnchangedContent({ description: '기존 설명', tags: ['ax'],
      files: [{ name: 'a.md', content: 'x', type: 'reference' }] })
    expect(result.success).toBe(true)
    expect(set).not.toHaveProperty('changelog')
    expect(notifySlackDeploy).not.toHaveBeenCalled()
    expect(createVersionSnapshot).not.toHaveBeenCalled()
    expect(prepareTextForEmbedding).not.toHaveBeenCalled()
  })

  it('기존 null 과 빈 배열은 같은 값으로 본다', async () => {
    const { result } = await deployUnchangedContent({ description: '기존 설명', tags: ['ax'], dependencies: [],
      files: [{ name: 'a.md', content: 'x', type: 'reference' }] })
    expect(result.changelog).toBe('No changes')
    expect(notifySlackDeploy).not.toHaveBeenCalled()
  })

  it('platforms 의 null 과 빈 배열은 다른 값으로 본다', async () => {
    const { result } = await deployUnchangedContent({ description: '기존 설명', tags: ['ax'], platforms: [],
      files: [{ name: 'a.md', content: 'x', type: 'reference' }] })
    expect(result.changelog).toBe('설정 수정')
  })

  it('설명만 고치면 No changes 대신 무엇을 고쳤는지 알린다', async () => {
    const { result } = await deployUnchangedContent({ description: '새 설명' })
    expect(result.changelog).toBe('설명 수정')
    expect(notifySlackDeploy).toHaveBeenCalledWith(expect.objectContaining({ changelog: '설명 수정' }))
  })

  it('본문이 같아도 배포자가 적은 changelog 는 버리지 않는다', async () => {
    const { result } = await deployUnchangedContent({ description: '새 설명', changelog: '메타 설명 다듬기' })
    expect(result.changelog).toBe('메타 설명 다듬기')
  })
})
