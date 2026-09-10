import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPopularSkillsMessages,
  notifySlackPopularSkills,
  type PopularSkillsParams,
} from '@gpters/lib/notifications'

const params: PopularSkillsParams = {
  days: 7, totalApplies: 8, distinctSkills: 2,
  lines: ['• popular-skill — 적용 8회 · 2명'],
  createdLines: ['• new-skill'],
  updatedLines: ['• updated-skill v1.1.0'],
  missingLines: ['• missing-description-skill'],
}
const response = (ts: string) => ({ ok: true, json: async () => ({ ok: true, ts }) })

beforeEach(() => {
  vi.stubEnv('SLACK_BOT_TOKEN', 'test-bot-token')
  vi.stubEnv('SLACK_SKILL_DIGEST_CHANNEL_ID', 'C_TEST')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('주간 스킬 소식 본문·스레드', () => {
  it('본문은 인기·신규만, 업데이트·설명 요청은 각각 답글로 만든다', () => {
    const messages = buildPopularSkillsMessages(params)!
    expect(messages.main.text).toContain('popular-skill')
    expect(messages.main.text).toContain('new-skill')
    expect(JSON.stringify(messages.main)).not.toContain('updated-skill')
    expect(JSON.stringify(messages.main)).not.toContain('missing-description-skill')
    expect(messages.replies).toHaveLength(2)
    expect(messages.replies[0].text).toContain('updated-skill')
    expect(messages.replies[1].text).toContain('missing-description-skill')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('빈 답글은 생략하고 신규만 있어도 본문을 만든다', () => {
    const messages = buildPopularSkillsMessages({ ...params, lines: [], updatedLines: [] })!
    expect(messages.main.text).not.toContain('많이 쓴 스킬')
    expect(messages.main.text).toContain('새로 올라온 스킬')
    expect(messages.replies).toHaveLength(1)
    expect(messages.replies[0].text).toContain('설명이 비어 있어요')
  })

  it('인기·신규가 없으면 업데이트·설명 요청만으로 발송하지 않는다', async () => {
    const empty = { ...params, lines: [], createdLines: [] }
    expect(buildPopularSkillsMessages(empty)).toBeNull()
    expect(await notifySlackPopularSkills(empty)).toEqual({ sent: false, repliesSent: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('두 답글은 첫 본문의 ts에 연결하고 채널에 재노출하지 않는다', async () => {
    const mockFetch = vi.mocked(fetch)
      .mockResolvedValueOnce(response('100.001') as Response)
      .mockResolvedValueOnce(response('100.002') as Response)
      .mockResolvedValueOnce(response('100.003') as Response)
    expect(await notifySlackPopularSkills(params)).toEqual({ sent: true, repliesSent: 2, threadTs: '100.001' })
    const bodies = mockFetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string))
    expect(bodies[0].thread_ts).toBeUndefined()
    expect(bodies.every((body) => body.username === '뽀밋')).toBe(true)
    for (const reply of bodies.slice(1)) {
      expect(reply).toMatchObject({ channel: 'C_TEST', thread_ts: '100.001', reply_broadcast: false })
    }
    expect(mockFetch.mock.calls.every(([url]) => url === 'https://slack.com/api/chat.postMessage')).toBe(true)
  })

  it.each(['SLACK_BOT_TOKEN', 'SLACK_SKILL_DIGEST_CHANNEL_ID'])('설정 %s 누락은 조용한 성공이 아니다', async (key) => {
    vi.stubEnv(key, '')
    await expect(notifySlackPopularSkills(params)).rejects.toThrow('requires SLACK_BOT_TOKEN')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('HTTP 200 ok:false이면 답글을 보내지 않는다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error: 'not_in_channel' }) } as Response)
    await expect(notifySlackPopularSkills(params)).rejects.toThrow('not_in_channel')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('본문 ts가 없으면 채널에 답글을 흘리지 않는다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)
    await expect(notifySlackPopularSkills(params)).rejects.toThrow('missing message timestamp')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('답글 실패에는 본문 ts·완료된 답글 수를 남기고 본문을 재전송하지 않는다', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response('100.001') as Response)
      .mockResolvedValueOnce(response('100.002') as Response)
      .mockRejectedValueOnce(new Error('Connection refused'))
    await expect(notifySlackPopularSkills(params)).rejects.toThrow('thread 100.001: 1/2 replies sent; Connection refused')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('429는 Retry-After만큼 기다린 뒤 같은 메시지만 재시도한다', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '1' }) } as Response)
      .mockResolvedValueOnce(response('100.001') as Response)
    const delivery = notifySlackPopularSkills({ ...params, updatedLines: [], missingLines: [] })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(delivery).resolves.toMatchObject({ sent: true, repliesSent: 0 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('HTTP 오류는 상위 크론에 전달한다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    await expect(notifySlackPopularSkills(params)).rejects.toThrow('HTTP 503')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
