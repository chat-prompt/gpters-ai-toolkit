import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/cron/popular-skills/route'
import { collectPopularSkills, notifySlackPopularSkills } from '@gpters/lib/notifications'
import { runCronJob } from '@gpters/lib/ops'

vi.mock('@gpters/lib/notifications', async (importOriginal) => ({
  ...await importOriginal<typeof import('@gpters/lib/notifications')>(),
  collectPopularSkills: vi.fn(),
  notifySlackPopularSkills: vi.fn(),
}))
vi.mock('@gpters/lib/ops', () => ({ runCronJob: vi.fn() }))

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', '')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')))
  vi.mocked(collectPopularSkills).mockResolvedValue({
    since: '2026-09-03T00:00:00Z', until: '2026-09-10T00:00:00Z',
    totalApplies: 2, distinctSkills: 1,
    top: [{ skillId: 'example', name: 'Example', applies: 2, users: 1, isFirstTime: false }],
    firstTimers: [], created: [], updated: [], missingDescriptions: [], missingDescriptionTotal: 0,
  })
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('quiet는 본문·답글 payload만 반환하고 발송·크론 기록 경로를 호출하지 않는다', async () => {
  const result = await GET(new NextRequest('http://localhost/api/cron/popular-skills?quiet=1'))
  const body = await result.json()
  expect(body.preview.main.text).toContain('Example')
  expect(body.preview.replies).toEqual([])
  expect(body.quiet).toBe(true)
  expect(notifySlackPopularSkills).not.toHaveBeenCalled()
  expect(runCronJob).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('quiet 집계 실패에도 실패 알림·크론 기록을 만들지 않는다', async () => {
  vi.mocked(collectPopularSkills).mockRejectedValueOnce(new Error('Database unavailable'))
  const result = await GET(new NextRequest('http://localhost/api/cron/popular-skills?quiet=1'))
  expect(result.status).toBe(500)
  expect(notifySlackPopularSkills).not.toHaveBeenCalled()
  expect(runCronJob).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('미리보기도 기존 크론 인증을 지킨다', async () => {
  vi.stubEnv('CRON_SECRET', 'test-secret')
  const result = await GET(new NextRequest('http://localhost/api/cron/popular-skills?quiet=1'))
  expect(result.status).toBe(401)
  expect(collectPopularSkills).not.toHaveBeenCalled()
})

it('실제 실행은 발송 결과를 크론 산출량과 응답에 포함한다', async () => {
  vi.mocked(notifySlackPopularSkills).mockResolvedValueOnce({ sent: true, repliesSent: 0, threadTs: '100.001' })
  vi.mocked(runCronJob).mockImplementationOnce(async (jobName, handler) => ({
    ok: true, jobName, durationMs: 0, ...await handler(),
  }))
  const result = await GET(new NextRequest('http://localhost/api/cron/popular-skills'))
  expect(await result.json()).toMatchObject({ success: true, sent: 1, repliesSent: 0, delivery: { threadTs: '100.001' } })
  expect(notifySlackPopularSkills).toHaveBeenCalledTimes(1)
  expect(fetch).not.toHaveBeenCalled()
})

