/**
 * 주간 인기 스킬 알림 테스트 (DEV-4280).
 *
 * 이 알림은 "발견"이 아니라 "선별"을 돕는 장치다. 그래서 무엇을 세고 어떻게 줄 세우는지가
 * 핵심이고, 특히 **비율을 쓰지 않는다**는 원칙이 문구에 그대로 드러나야 한다.
 */

import { describe, expect, it } from 'vitest'
import {
  formatDigestLines,
  rankSkills,
  type PopularSkill,
  type PopularSkillDigest,
} from '../../../../packages/lib/src/notifications/popular-skills'

/**
 * 최소 스킬 하나
 *
 * @param skillId - 카탈로그 id
 * @param overrides - 덮어쓸 값
 */
function skill(skillId: string, overrides: Partial<PopularSkill> = {}): PopularSkill {
  return { skillId, name: skillId, applies: 1, users: 1, isFirstTime: false, ...overrides }
}

describe('rankSkills', () => {
  it('사람 수를 먼저 본다 — 한 사람이 열 번 쓴 것보다 세 사람이 한 번씩이 낫다', () => {
    const ranked = rankSkills([
      skill('solo', { applies: 10, users: 1 }),
      skill('shared', { applies: 3, users: 3 }),
    ])
    expect(ranked.map((entry) => entry.skillId)).toEqual(['shared', 'solo'])
  })

  it('사람 수가 같으면 적용 건수로 가른다', () => {
    const ranked = rankSkills([
      skill('few', { applies: 2, users: 2 }),
      skill('many', { applies: 9, users: 2 }),
    ])
    expect(ranked[0].skillId).toBe('many')
  })

  it('둘 다 같으면 id로 안정 정렬한다 — 매주 순서가 흔들리면 안 읽는다', () => {
    const ranked = rankSkills([skill('b'), skill('a')])
    expect(ranked.map((entry) => entry.skillId)).toEqual(['a', 'b'])
  })

  it('원본을 바꾸지 않는다', () => {
    const input = [skill('b'), skill('a')]
    rankSkills(input)
    expect(input.map((entry) => entry.skillId)).toEqual(['b', 'a'])
  })
})

describe('formatDigestLines', () => {
  /**
   * 상위 목록만 채운 집계
   *
   * @param top - 상위 스킬
   */
  function digest(top: PopularSkill[]): PopularSkillDigest {
    return {
      since: '2026-08-31T00:00:00.000Z',
      until: '2026-09-07T00:00:00.000Z',
      totalApplies: top.reduce((sum, entry) => sum + entry.applies, 0),
      distinctSkills: top.length,
      top,
      firstTimers: top.filter((entry) => entry.isFirstTime),
    }
  }

  it('건수와 사람 수만 적고 비율은 쓰지 않는다', () => {
    const [line] = formatDigestLines(
      digest([skill('post', { name: '게시글 작성', applies: 6, users: 3 })]),
      'https://example.test'
    )
    expect(line).toContain('적용 6회')
    expect(line).toContain('3명')
    expect(line).not.toMatch(/%/)
  })

  it('스킬 상세로 링크를 건다', () => {
    const [line] = formatDigestLines(
      digest([skill('post', { name: '게시글 작성' })]),
      'https://example.test'
    )
    expect(line).toContain('<https://example.test/skill/post|게시글 작성>')
  })

  it('이번 주 처음 쓰인 스킬은 표시한다', () => {
    const [line] = formatDigestLines(
      digest([skill('new-one', { isFirstTime: true })]),
      'https://example.test'
    )
    expect(line).toContain('이번 주 첫 사용')
  })

  it('한 사람만 쓴 스킬에 "여러 명"이라고 말하지 않는다', () => {
    const [line] = formatDigestLines(
      digest([skill('solo', { applies: 4, users: 1 })]),
      'https://example.test'
    )
    expect(line).toContain('1명')
  })

  it('적용이 없으면 줄도 없다 — 보낼 것이 없으면 안 보낸다', () => {
    expect(formatDigestLines(digest([]), 'https://example.test')).toEqual([])
  })
})
