import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/client.js', () => ({
  jsonRpcSessionCall: vi.fn().mockResolvedValue({ ok: true, data: { isError: false } }),
}))
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'token') }))
vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))

import { jsonRpcSessionCall } from '../../src/client.js'
import { resolveToken } from '../../src/auth.js'
import { error, jsonOut } from '../../src/output.js'
import { runReportSession } from '../../src/commands/report-session.js'

describe('aitk report-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(resolveToken).mockReturnValue('token')
    vi.mocked(jsonRpcSessionCall).mockResolvedValue({ ok: true, data: { isError: false } })
  })

  it('initializes an MCP session before sending the aggregate event', async () => {
    await runReportSession({ count: 7, version: '0.1.24' })

    expect(jsonRpcSessionCall).toHaveBeenCalledWith(
      'tools/call',
      {
        name: 'report_session_event',
        arguments: {
          eventType: 'session_end',
          promptCount: 7,
          pluginVersion: '0.1.24',
        },
      },
      'token',
      { name: 'aitk-session-reporter', version: '0.1.24' }
    )
    expect(jsonOut).toHaveBeenCalledWith({ isError: false })
  })

  it('missing auth is silent but returns a retryable nonzero status', async () => {
    vi.mocked(resolveToken).mockReturnValue(undefined)
    await runReportSession({ count: 1 })
    expect(process.exitCode).toBe(2)
    expect(jsonRpcSessionCall).not.toHaveBeenCalled()
    expect(jsonOut).not.toHaveBeenCalled()
  })

  it('fails when transport or the MCP tool rejects the event', async () => {
    vi.mocked(jsonRpcSessionCall).mockResolvedValueOnce({ ok: false, error: 'network failed' })
    await expect(runReportSession({ count: 1 })).rejects.toThrow('network failed')
    expect(error).toHaveBeenCalledWith('network failed')

    vi.mocked(jsonRpcSessionCall).mockResolvedValueOnce({ ok: true, data: { isError: true } })
    await expect(runReportSession({ count: 1 })).rejects.toThrow('Session report rejected')
  })
})
