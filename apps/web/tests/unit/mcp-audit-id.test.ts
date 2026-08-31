/** Audit rows expose their generated ID so normalized events can link idempotently. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { insert: vi.fn() },
  mcpAuditLogs: { name: 'mcp_audit_logs' },
}))

import { db, mcpAuditLogs } from '@gpters/db'
import { logMcpRequest } from '@gpters/lib/security'

const entry = {
  method: 'rest:get',
  tool: 'get_plugin_content',
  isAuthenticated: true,
  ipHash: 'masked-ip',
  responseStatus: 'success' as const,
}

describe('logMcpRequest source id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the same id that was inserted', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({ values } as never)

    const auditLogId = await logMcpRequest(entry)

    expect(auditLogId).toMatch(/^[0-9a-f-]{36}$/)
    expect(db.insert).toHaveBeenCalledWith(mcpAuditLogs)
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ id: auditLogId }))
  })

  it('returns null when the audit row cannot be stored', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('database unavailable')),
    } as never)

    await expect(logMcpRequest(entry)).resolves.toBeNull()
  })
})
