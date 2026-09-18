import { beforeEach, describe, expect, it, vi } from 'vitest'

const { select, load, getAxPanel } = vi.hoisted(() => ({
  select: vi.fn(),
  load: vi.fn(),
  getAxPanel: vi.fn(),
}))

vi.mock('@gpters/db', () => ({ db: { select }, users: { id: 'users.id', email: 'users.email' } }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))
vi.mock('../../../../packages/lib/src/features/ax', () => ({
  resolveAxViewer: (input: { email?: string; role?: string } | null = {}) => ({
    canAccess: input?.email?.endsWith('@gpters.org') ?? false,
    isAdmin: input?.role === 'admin',
    reason: input?.email ? 'not_internal_member' : 'unauthenticated',
  }),
  listAxPanels: ({ isAdmin }: { isAdmin: boolean }) => isAdmin ? [{ id: 'org' }, { id: 'admin' }] : [{ id: 'org' }],
  getAxPanel,
  canViewPanel: (viewer: { canAccess: boolean; isAdmin: boolean }, visibility: string) =>
    viewer.canAccess && (visibility === 'org' || viewer.isAdmin),
}))

import { listReadableAxPanels, readAxPanel } from '../../../../packages/lib/src/mcp/ax-read'

function user(email: string) {
  select.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ email }]),
  })
}

describe('AX MCP read boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    user('owner@gpters.org')
    getAxPanel.mockReturnValue({ meta: { visibility: 'org' }, load })
    load.mockResolvedValue({ status: 'ok', data: { count: 3 } })
  })

  it('rejects unauthenticated and outside-domain callers', async () => {
    expect(await listReadableAxPanels()).toEqual({ ok: false, error: 'unauthenticated' })
    user('outsider@example.org')
    expect(await readAxPanel('org', 7, 'user-1', 'admin')).toEqual({ ok: false, error: 'forbidden' })
    expect(load).not.toHaveBeenCalled()
  })

  it('does not reveal admin panels or admin-only fields to an admin caller', async () => {
    expect(await listReadableAxPanels('user-1', 'admin')).toEqual({ ok: true, value: [{ id: 'org' }] })
    getAxPanel.mockReturnValueOnce({ meta: { visibility: 'admin' }, load })
    expect(await readAxPanel('admin', 7, 'user-1', 'admin')).toEqual({ ok: false, error: 'forbidden' })
    expect(load).not.toHaveBeenCalled()
    expect(await readAxPanel('org', 30, 'user-1', 'admin')).toMatchObject({ ok: true })
    expect(load).toHaveBeenCalledWith({ days: 30, isAdmin: false })
  })

  it('validates the requested period before loading a panel', async () => {
    expect(await readAxPanel('org', 365, 'user-1')).toEqual({ ok: false, error: 'invalid_days' })
    expect(load).not.toHaveBeenCalled()
  })
})
