import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/agent-auth.js', () => ({ readAgentConfig: vi.fn(), readAgentToken: vi.fn() }))
vi.mock('../src/config.js', () => ({ readConfig: vi.fn(() => ({ token: 'personal-config-token' })) }))
import { readAgentConfig, readAgentToken } from '../src/agent-auth.js'
import { readConfig } from '../src/config.js'
import { resolveToken } from '../src/auth.js'
const previous = process.env.GPTERS_TOKEN
beforeEach(() => {
  vi.clearAllMocks()
  process.env.GPTERS_TOKEN = 'personal-env-token'
  vi.mocked(readAgentConfig).mockReturnValue({ version: 1, agentId: 'example-agent', serverUrl: 'https://toolkit.test' })
})
afterEach(() => { if (previous === undefined) delete process.env.GPTERS_TOKEN; else process.env.GPTERS_TOKEN = previous })
describe('agent mode authentication priority', () => {
  it('uses only the agent token even when personal environment and config credentials exist', () => {
    vi.mocked(readAgentToken).mockReturnValueOnce('aia_agent')
    expect(resolveToken()).toBe('aia_agent')
    expect(readConfig).not.toHaveBeenCalled()
  })
  it('does not fall back when Keychain is locked', () => {
    vi.mocked(readAgentToken).mockImplementationOnce(() => { throw new Error('Keychain locked') })
    expect(() => resolveToken()).toThrow('Keychain locked')
    expect(readConfig).not.toHaveBeenCalled()
  })
})
