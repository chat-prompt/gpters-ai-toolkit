import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', () => ({
  CONFIGURABLE_KEYS: {
    searchMethod: { description: 'method', values: ['auto', 'mcp', 'cli'] },
    serverUrl: { description: 'url' },
    agentId: { description: 'agent' },
  },
  readConfig: vi.fn(() => ({ serverUrl: 'https://test.example.com', searchMethod: 'cli' })),
  writeConfig: vi.fn(),
}))

vi.mock('../../src/output.js', () => ({
  info: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))

import { readConfig, writeConfig } from '../../src/config.js'
import { runConfig } from '../../src/commands/config.js'

describe('aitk config agentId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readConfig).mockReturnValue({ serverUrl: 'https://test.example.com', searchMethod: 'cli' })
  })

  it('안정적인 agentId를 로컬 설정에 저장한다', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})

    runConfig('set', ['agentId', 'bbodoong'])

    expect(writeConfig).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'bbodoong' }))
    expect(output).toHaveBeenCalledWith(JSON.stringify({ agentId: 'bbodoong', updated: true }))
    output.mockRestore()
  })

  it('대문자나 공백이 포함된 agentId를 거부한다', () => {
    expect(() => runConfig('set', ['agentId', 'Bbo Doong'])).toThrow('Invalid agentId')
    expect(writeConfig).not.toHaveBeenCalled()
  })

  it('실행 보고 서버 계약보다 긴 agentId를 거부한다', () => {
    expect(() => runConfig('set', ['agentId', `a${'b'.repeat(80)}`])).toThrow('Invalid agentId')
    expect(writeConfig).not.toHaveBeenCalled()
  })
})
