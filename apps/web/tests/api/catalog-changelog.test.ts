/**
 * catalog-changelog.test.ts
 *
 * Tests for changelog enforcement on PUT /api/catalog/[id].
 * Verifies that content changes require a non-empty changelog, while
 * metadata-only updates are accepted without one (EDU-7987 Task 4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock factories (must run before any module import)
// ---------------------------------------------------------------------------

const { mockDb, mockCatalogItems } = vi.hoisted(() => {
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

  return { mockDb, mockCatalogItems }
})

// ---------------------------------------------------------------------------
// Module mocks (must appear before any imports that trigger module resolution)
// ---------------------------------------------------------------------------

vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: mockCatalogItems,
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  ilike: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock('@/lib/core/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  withRateLimit: vi.fn().mockReturnValue(null),
  RateLimitPresets: { standard: 'standard', admin: 'admin' },
}))

vi.mock('@/lib/security/rbac', () => ({
  Permissions: { CATALOG_EDIT: 'catalog:edit', CATALOG_DELETE: 'catalog:delete' },
  isSuperAdmin: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/utils/api-cache', () => ({
  cachedJsonResponse: vi.fn(),
  addSurrogateKey: vi.fn(),
}))

vi.mock('@/lib/utils/api-utils', () => ({
  requirePermissionAsync: vi.fn().mockResolvedValue(null),
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1', email: 'u1@gpters.org' }),
  ApiErrors: {
    badRequest: (message: string) =>
      new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    notFound: (resource = 'Resource') =>
      new Response(JSON.stringify({ error: `${resource} not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    unauthorized: (message = 'Unauthorized') =>
      new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    internalError: (message = 'Internal server error') =>
      new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
  },
}))

vi.mock('@/lib/core/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: 'u1',
      email: 'u1@gpters.org',
      role: 'editor',
      currentOrgId: 'org-1',
    },
  }),
}))

vi.mock('@/lib/versioning/skill-version', () => ({
  analyzeChanges: vi.fn().mockImplementation((prev: string, next: string) => ({
    hasChanges: prev !== next,
    breaking: false,
    newFeatures: false,
    summary: prev !== next ? 'Content changed' : 'No change',
  })),
  createVersionOnUpdate: vi.fn().mockResolvedValue(null),
}))

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { PUT } from '@/app/api/catalog/[id]/route'
import { analyzeChanges, createVersionOnUpdate } from '@/lib/versioning/skill-version'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXISTING_ITEM = {
  id: 'sample-skill',
  name: 'Sample Skill',
  type: 'skill',
  content: 'old content',
  version: '1.0.0',
  orgId: 'org-1',
  description: 'A sample skill',
  authorId: 'u1',
  tags: [],
  difficulty: 'easy',
  status: 'active',
  changelog: null,
  mcpEnabled: false,
  visibility: 'public',
  updatedAt: new Date(),
}

/** Creates a fluent select-chain mock that resolves with the given rows. */
function mockSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    limit: vi.fn().mockResolvedValue(rows),
  }
  return chain
}

/** Creates a fluent update-chain mock. */
function mockUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
}

const db = mockDb

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PUT /api/catalog/[id] — changelog enforcement (EDU-7987 Task 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(analyzeChanges).mockImplementation((prev: string, next: string) => ({
      hasChanges: prev !== next,
      breaking: false,
      newFeatures: false,
      summary: prev !== next ? 'Content changed' : 'No change',
    }))
  })

  it('rejects content change without changelog', async () => {
    // First select: fetch existing item; second select: fetch updated item
    vi.mocked(db.select)
      .mockReturnValueOnce(mockSelectChain([EXISTING_ITEM]) as never)
      .mockReturnValueOnce(mockSelectChain([{ ...EXISTING_ITEM, content: 'new content' }]) as never)
    vi.mocked(db.update).mockReturnValue(mockUpdateChain() as never)

    const req = new Request('http://localhost/api/catalog/sample-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'new content' }), // no changelog
    })
    const res = await PUT(req as never, { params: Promise.resolve({ id: 'sample-skill' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('changelog')
  })

  it('accepts content change with changelog', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(mockSelectChain([EXISTING_ITEM]) as never)
      .mockReturnValueOnce(mockSelectChain([{ ...EXISTING_ITEM, content: 'new content' }]) as never)
    vi.mocked(db.update).mockReturnValue(mockUpdateChain() as never)

    const req = new Request('http://localhost/api/catalog/sample-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'new content', changelog: 'meaningful update' }),
    })
    const res = await PUT(req as never, { params: Promise.resolve({ id: 'sample-skill' }) })
    expect(res.status).toBe(200)
  })

  it('accepts metadata-only update without changelog (hasChanges=false)', async () => {
    // content is not included in the body — only description changes
    vi.mocked(db.select)
      .mockReturnValueOnce(mockSelectChain([EXISTING_ITEM]) as never)
      .mockReturnValueOnce(mockSelectChain([{ ...EXISTING_ITEM, description: 'new desc' }]) as never)
    vi.mocked(db.update).mockReturnValue(mockUpdateChain() as never)

    const req = new Request('http://localhost/api/catalog/sample-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'new desc' }), // content unchanged
    })
    const res = await PUT(req as never, { params: Promise.resolve({ id: 'sample-skill' }) })
    expect(res.status).toBe(200)
    // No version creation should occur since content is untouched
    expect(createVersionOnUpdate).not.toHaveBeenCalled()
  })
})
