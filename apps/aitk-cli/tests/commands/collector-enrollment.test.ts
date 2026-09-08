import { mkdtempSync, readFileSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'personal-owner-token') }))
vi.mock('../../src/output.js', () => ({ jsonOut: vi.fn() }))
import { runAuthorizeCollector, readCollectorEnrollment } from '../../src/agent-telemetry/enrollment.js'
import { jsonOut } from '../../src/output.js'
const token = `agt_${'b'.repeat(64)}`
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-owner-grant-'))
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, collectorToken: token }))))
})
afterEach(() => { vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }) })
const scope = { agentId: 'example-agent', source: 'claude-code', collectorId: 'collector-test', intervalSeconds: 3600,
  serverUrl: 'https://ai-toolkit.gpters.org' }
describe('owner-only collector authorization', () => {
  it.each(['true', './grant.json'])('rejects unsafe output path %s before authorization', async output => {
    await expect(runAuthorizeCollector({ ...scope, output })).rejects.toThrow('absolute')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('개인 토큰을 보내는 곳은 등록 API뿐이고 파일·출력에는 남기지 않는다', async () => {
    const output = join(root, 'grant.json')
    await runAuthorizeCollector({ ...scope, output })
    const content = readFileSync(output, 'utf8')
    expect(content).not.toContain('personal-owner-token')
    expect(content).toContain(token)
    expect(statSync(output).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(vi.mocked(jsonOut).mock.calls)).not.toContain(token)
    expect(fetch).toHaveBeenCalledWith(`${scope.serverUrl}/api/ax/agent-telemetry/enroll`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer personal-owner-token' }),
    }))
    async function* input() { yield content }
    expect(await readCollectorEnrollment(input())).toMatchObject({ ...scope, collectorToken: token })
  })
  it('이미 있는 파일은 덮어쓰거나 서버 토큰을 회전시키지 않는다', async () => {
    const output = join(root, 'grant.json'); writeFileSync(output, 'keep')
    await expect(runAuthorizeCollector({ ...scope, output })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    expect(readFileSync(output, 'utf8')).toBe('keep')
  })
  it('성공 HTTP에 유효하지 않은 자격증명이 오면 등록을 취소하고 파일을 지운다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, collectorToken: 'personal-owner-token' })))
    const output = join(root, 'grant.json')
    await expect(runAuthorizeCollector({ ...scope, output })).rejects.toThrow('collector-only')
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.method).toBe('DELETE')
    expect(existsSync(output)).toBe(false)
  })
  it.each(['not json', JSON.stringify({ ...scope, version: 1, collectorToken: 'mcp_personal' }), 'x'.repeat(4097)])(
    '잘못되거나 개인 토큰이 들어간 입력을 거부한다', async (content) => {
      async function* input() { yield content }
      await expect(readCollectorEnrollment(input())).rejects.toThrow()
    },
  )
})
