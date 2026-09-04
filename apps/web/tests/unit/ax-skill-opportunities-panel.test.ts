/**
 * AX 대시보드 — 스킬 개선 기회 패널 테스트
 *
 * db는 모킹하고, 패널이 스킬별 수치를 어떤 기준으로 분류·정렬·절단하는지 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { db } from '@gpters/db'
import { skillOpportunitiesPanel } from '../../../../packages/lib/src/features/ax/skill-opportunities'

/** 스킬 한 줄을 만든다. 지정하지 않은 값은 0이다 */
function skill(
  skill_id: string,
  name: string,
  values: Partial<{
    shown: number
    loaded: number
    applied: number
    skipped: number
    appliers: number
    anonymous_applies: number
  }>
) {
  return {
    skill_id,
    name,
    shown: 0,
    loaded: 0,
    applied: 0,
    skipped: 0,
    appliers: 0,
    anonymous_applies: 0,
    ...values,
  }
}

/** 스킬 통계와 검색 요청 수를 순서대로 돌려준다 */
function queueRows(skills: unknown[], search: { total: number; observed: number; zero_result: number }) {
  vi.mocked(db.execute)
    .mockResolvedValueOnce({ rows: skills } as never)
    .mockResolvedValueOnce({ rows: [search] } as never)
}

function groupOf(data: NonNullable<Awaited<ReturnType<typeof skillOpportunitiesPanel.load>>['data']>, category: string) {
  return data.groups.find((group) => group.category === category)!
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AX 스킬 개선 기회 패널', () => {
  it('기준을 넘은 스킬만 분류하고 표본이 작으면 넣지 않는다', async () => {
    queueRows([
      // 노출은 많은데 로드가 10% 미만 → low_load
      skill('quiet', '조용한 스킬', { shown: 100, loaded: 3 }),
      // 노출이 기준(30)에 못 미쳐 로드율이 낮아도 분류하지 않는다
      skill('tiny', '표본 작은 스킬', { shown: 20, loaded: 0 }),
      // 로드는 되는데 적용이 1/3 미만 → low_apply, 건너뜀이 있으므로 no_outcome은 아니다
      skill('opened', '열리는 스킬', { shown: 40, loaded: 12, applied: 1, skipped: 2, appliers: 1 }),
      // 로드 후 적용·건너뜀 모두 0 → low_apply와 no_outcome 양쪽
      skill('silent', '결과 없는 스킬', { shown: 10, loaded: 8 }),
      // 적용은 여러 번이나 사람이 한 명 → single_user
      skill('solo', '혼자 쓰는 스킬', { shown: 12, loaded: 9, applied: 5, appliers: 1 }),
      // 두루 쓰이는 스킬은 어느 분류에도 들어가지 않는다
      skill('healthy', '건강한 스킬', { shown: 50, loaded: 20, applied: 12, appliers: 4 }),
    ], { total: 300, observed: 280, zero_result: 7 })

    const result = await skillOpportunitiesPanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!

    expect(groupOf(data, 'low_load').skills.map((s) => s.skillId)).toEqual(['quiet'])
    expect(groupOf(data, 'low_apply').skills.map((s) => s.skillId)).toEqual(['opened', 'silent'])
    expect(groupOf(data, 'no_outcome').skills.map((s) => s.skillId)).toEqual(['silent'])
    expect(groupOf(data, 'single_user').skills.map((s) => s.skillId)).toEqual(['solo'])

    // 두루 쓰이는 스킬은 어디에도 없다
    for (const group of data.groups) {
      expect(group.skills.map((s) => s.skillId)).not.toContain('healthy')
    }

    expect(data.searchRequests).toBe(300)
    // 결과 목록이 기록된 요청만 결과 수를 확인할 수 있다
    expect(data.observedSearches).toBe(280)
    expect(data.zeroResultSearches).toBe(7)
    // 기준값을 함께 내려보내 화면이 판단 근거를 적을 수 있게 한다
    expect(data.thresholds).toEqual({
      minShown: 30,
      minLoaded: 5,
      minApplied: 3,
      loadRate: 0.1,
      applyRate: 1 / 3,
    })
    // silent가 두 분류에 들어가므로 분류별 합(5)이 아니라 고유 스킬 수(4)를 센다
    expect(result.highlights?.[0]).toMatchObject({ label: '개선 후보 스킬', value: '4' })
  })

  it('계정을 알 수 없는 적용이 섞여 있으면 한 사람이라고 단정하지 않는다', async () => {
    queueRows([
      // 식별된 계정 1개 + 계정 불명 2건 → 정말 한 사람인지 알 수 없다
      skill('mixed', '섞인 스킬', { applied: 5, appliers: 1, anonymous_applies: 2 }),
      // 계정 불명 보고가 없으면 그대로 한 사람으로 본다
      skill('clean', '깨끗한 스킬', { applied: 4, appliers: 1 }),
    ], { total: 0, observed: 0, zero_result: 0 })

    const data = (await skillOpportunitiesPanel.load({ days: 30, isAdmin: false })).data!
    expect(groupOf(data, 'single_user').skills.map((s) => s.skillId)).toEqual(['clean'])
  })

  it('분류마다 고치면 효과가 큰 순으로 정렬하고 열 개까지만 내려보낸다', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      skill(`low-${index}`, `스킬 ${index}`, { shown: 30 + index * 10, loaded: 1 })
    )
    queueRows(many, { total: 10, observed: 10, zero_result: 0 })

    const data = (await skillOpportunitiesPanel.load({ days: 7, isAdmin: false })).data!
    const group = groupOf(data, 'low_load')

    expect(group.total).toBe(12)
    expect(group.skills).toHaveLength(10)
    // 노출이 큰 순 — 고칠 때 영향이 가장 큰 스킬이 위로 온다
    expect(group.skills[0].skillId).toBe('low-11')
    expect(group.skills.at(-1)?.skillId).toBe('low-2')
  })

  it('이름이 비어 있으면 스킬 ID로 대신하고, 조회가 실패하면 오류 상태를 돌려준다', async () => {
    queueRows(
      [{ skill_id: 'no-name', name: '  ', shown: 60, loaded: 0, applied: 0, skipped: 0, appliers: 0, anonymous_applies: 0 }],
      { total: 1, observed: 1, zero_result: 0 }
    )
    const named = (await skillOpportunitiesPanel.load({ days: 30, isAdmin: false })).data!
    expect(groupOf(named, 'low_load').skills[0].name).toBe('no-name')

    vi.mocked(db.execute).mockRejectedValue(new Error('boom') as never)
    const failed = await skillOpportunitiesPanel.load({ days: 30, isAdmin: false })
    expect(failed.status).toBe('error')
    expect(failed.data).toBeNull()
  })
})
