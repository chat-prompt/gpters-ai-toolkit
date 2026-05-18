import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/client.js', () => ({
  apiCall: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
}))
vi.mock('../../src/auth.js', () => ({ resolveToken: () => 'tok' }))
vi.mock('../../src/output.js', () => ({ jsonOut: vi.fn(), error: vi.fn() }))

import { runDeploy } from '../../src/commands/deploy.js'
import { apiCall } from '../../src/client.js'

describe('aitk deploy --changelog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes changelog to the API when provided', async () => {
    await runDeploy({
      id: 'x',
      type: 'skill',
      name: 'X',
      content: 'hi',
      changelog: 'fixed bug',
    } as any)
    expect(apiCall).toHaveBeenCalledWith('deploy', expect.objectContaining({ changelog: 'fixed bug' }), 'tok')
  })

  it('omits changelog when not provided (server decides)', async () => {
    await runDeploy({ id: 'x', type: 'skill', name: 'X', content: 'hi' } as any)
    const [, params] = (apiCall as any).mock.calls[0]
    expect(params.changelog).toBeUndefined()
  })
})
