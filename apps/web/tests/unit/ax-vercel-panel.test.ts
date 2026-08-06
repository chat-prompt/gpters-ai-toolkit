/**
 * AX Dashboard — Vercel 배포 사이트 패널 단위 테스트
 *
 * global.fetch를 스텁해 실제 Vercel API 호출 없이 매핑·캐시·에러 처리를 검증한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetVercelCache, vercelDeploymentsPanel } from '../../../../packages/lib/src/features/ax/vercel'

const CTX = { days: 7, isAdmin: false, orgId: null }

/** Vercel /v9/projects 응답 형태의 최소 목업 */
function mockProjectsResponse(projects: unknown[], next: number | null = null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ projects, pagination: { next } }),
  }
}

describe('vercelDeploymentsPanel', () => {
  beforeEach(() => {
    __resetVercelCache()
    delete process.env.VERCEL_API_TOKEN
    delete process.env.VERCEL_TEAM_ID
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.VERCEL_API_TOKEN
    delete process.env.VERCEL_TEAM_ID
  })

  it('토큰이 없으면 not_configured 상태를 반환한다', async () => {
    const result = await vercelDeploymentsPanel.load(CTX)

    expect(result.status).toBe('not_configured')
    expect(result.data).toBeNull()
  })

  it('정상 응답을 매핑·정렬해서 반환한다 (alias 우선, ISO 변환, lastDeployedAt 내림차순)', async () => {
    process.env.VERCEL_API_TOKEN = 'test-token'

    const fetchMock = vi.fn().mockResolvedValue(
      mockProjectsResponse([
        {
          id: 'prj_older',
          name: 'older-site',
          framework: 'nextjs',
          targets: {
            production: {
              alias: ['older.example.com', 'older-fallback.vercel.app'],
              url: 'older-raw.vercel.app',
              createdAt: 1_700_000_000_000,
              readyState: 'READY',
            },
          },
        },
        {
          id: 'prj_newer',
          name: 'newer-site',
          framework: null,
          targets: {
            production: {
              url: 'newer-raw.vercel.app',
              createdAt: 1_710_000_000_000,
              readyState: 'ERROR',
            },
          },
          latestDeployments: [{ createdAt: 1_705_000_000_000 }],
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await vercelDeploymentsPanel.load(CTX)

    expect(result.status).toBe('ok')
    expect(result.data?.projects).toHaveLength(2)

    // lastDeployedAt 내림차순 — newer-site가 먼저
    const [first, second] = result.data!.projects
    expect(first.id).toBe('prj_newer')
    expect(second.id).toBe('prj_older')

    // productionUrl은 alias 우선
    expect(second.productionUrl).toBe('older.example.com')
    expect(first.productionUrl).toBe('newer-raw.vercel.app')

    // lastDeployedAt ISO 변환
    expect(first.lastDeployedAt).toBe(new Date(1_710_000_000_000).toISOString())
    expect(second.lastDeployedAt).toBe(new Date(1_700_000_000_000).toISOString())

    expect(first.lastDeploymentState).toBe('ERROR')
    expect(second.framework).toBe('nextjs')
  })

  it('401 응답이면 error 상태이고 메시지에 토큰 값이 포함되지 않는다', async () => {
    process.env.VERCEL_API_TOKEN = 'super-secret-token'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    )

    const result = await vercelDeploymentsPanel.load(CTX)

    expect(result.status).toBe('error')
    expect(result.message).not.toContain('super-secret-token')
  })

  it('500 응답이면 error 상태이고 메시지에 토큰 값이 포함되지 않는다', async () => {
    process.env.VERCEL_API_TOKEN = 'super-secret-token'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )

    const result = await vercelDeploymentsPanel.load(CTX)

    expect(result.status).toBe('error')
    expect(result.message).not.toContain('super-secret-token')
  })

  it('네트워크 오류가 나도 error 상태이고 메시지에 토큰 값이 포함되지 않는다', async () => {
    process.env.VERCEL_API_TOKEN = 'super-secret-token'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await vercelDeploymentsPanel.load(CTX)

    expect(result.status).toBe('error')
    expect(result.message).not.toContain('super-secret-token')
  })

  it('두 번 호출해도 캐시 TTL 내에서는 fetch가 1회만 불린다', async () => {
    process.env.VERCEL_API_TOKEN = 'test-token'
    const fetchMock = vi.fn().mockResolvedValue(mockProjectsResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await vercelDeploymentsPanel.load(CTX)
    await vercelDeploymentsPanel.load(CTX)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
