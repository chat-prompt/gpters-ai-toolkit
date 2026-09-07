/**
 * 주간 인기 스킬 알림 테스트 (DEV-4280).
 *
 * 이 알림은 "발견"이 아니라 "선별"을 돕는 장치다. 그래서 무엇을 세고 어떻게 줄 세우는지가
 * 핵심이고, 특히 **비율을 쓰지 않는다**는 원칙이 문구에 그대로 드러나야 한다.
 */

import { describe, expect, it } from 'vitest'
import {
  formatCreatedLines,
  formatDigestLines,
  formatUpdatedLines,
  formatMissingDescriptionLines,
  hasAnythingToSay,
  rankSkills,
  shortSummary,
  type CatalogChange,
  type MissingDescription,
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
      created: [],
      updated: [],
      missingDescriptions: [],
      missingDescriptionTotal: 0,
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

describe('새로 올라온·업데이트된 스킬 구역', () => {
  /**
   * 세 구역을 채운 집계
   *
   * @param created - 새로 올라온 항목
   * @param updated - 갱신된 항목
   */
  function digest(created: CatalogChange[], updated: CatalogChange[]): PopularSkillDigest {
    return {
      since: '2026-08-31T00:00:00.000Z',
      until: '2026-09-07T00:00:00.000Z',
      totalApplies: 0,
      distinctSkills: 0,
      top: [],
      firstTimers: [],
      created,
      updated,
    }
  }

  const NEW: CatalogChange = {
    id: 'beusable', name: '뷰저블 페이지 등록', authorName: '윤누리', version: '1.0.0',
    summary: '뷰저블에 페이지를 등록하고 방문 기록을 남긴다',
  }
  const BUMPED: CatalogChange = {
    id: 'gpters-newsletter-v2', name: '뉴스레터 v2', authorName: '강지인', version: '2.2.1', bumps: 11,
    summary: '지피터스 뉴스레터 제작·발송·웹발행', changeNote: '문구 정정',
  }

  it('새로 올라온 것은 만든 사람을 함께 적는다', () => {
    const [line] = formatCreatedLines(digest([NEW], []), 'https://example.test')
    expect(line).toContain('<https://example.test/skill/beusable|뷰저블 페이지 등록>')
    expect(line).toContain('윤누리')
  })

  it('업데이트된 것은 현재 버전을 적는다', () => {
    const [line] = formatUpdatedLines(digest([], [BUMPED]), 'https://example.test')
    expect(line).toContain('v2.2.1')
  })

  it('한 주에 여러 번 고쳤으면 횟수를 적는다 — 같은 스킬로 목록을 채우지 않는다', () => {
    const [line] = formatUpdatedLines(digest([], [BUMPED]), 'https://example.test')
    expect(line).toContain('11회')
  })

  it('한 번만 고쳤으면 횟수를 적지 않는다 — 당연한 것을 적으면 줄만 길어진다', () => {
    const once = { ...BUMPED, bumps: 1 }
    const [line] = formatUpdatedLines(digest([], [once]), 'https://example.test')
    expect(line).not.toMatch(/\d+회/)
  })

  it('저자가 없으면 이름 자리를 비운다 — "null"이라고 쓰지 않는다', () => {
    const [line] = formatCreatedLines(digest([{ ...NEW, authorName: null }], []), 'https://example.test')
    expect(line).not.toContain('null')
  })
})

describe('hasAnythingToSay', () => {
  /** 세 구역이 모두 빈 집계 */
  const EMPTY: PopularSkillDigest = {
    since: '2026-08-31T00:00:00.000Z',
    until: '2026-09-07T00:00:00.000Z',
    totalApplies: 0,
    distinctSkills: 0,
    top: [],
    firstTimers: [],
    created: [],
    updated: [],
    missingDescriptions: [],
    missingDescriptionTotal: 0,
  }

  it('세 구역이 전부 비면 보내지 않는다', () => {
    expect(hasAnythingToSay(EMPTY)).toBe(false)
  })

  it('쓴 사람이 없어도 새 스킬이 올라왔으면 보낸다', () => {
    const withNew = { ...EMPTY, created: [{ id: 'a', name: 'a', authorName: null, version: '1.0.0', summary: null }] }
    expect(hasAnythingToSay(withNew)).toBe(true)
  })

  it('업데이트만 있어도 보낸다', () => {
    const withUpdate = { ...EMPTY, updated: [{ id: 'a', name: 'a', authorName: null, version: '1.1.0', bumps: 1, summary: null, changeNote: null }] }
    expect(hasAnythingToSay(withUpdate)).toBe(true)
  })
})

describe('설명과 변경 요약', () => {
  /** 세 구역을 채운 집계 */
  function digest(created: CatalogChange[], updated: CatalogChange[]): PopularSkillDigest {
    return {
      since: '2026-08-31T00:00:00.000Z',
      until: '2026-09-07T00:00:00.000Z',
      totalApplies: 0, distinctSkills: 0, top: [], firstTimers: [], created, updated,
      missingDescriptions: [], missingDescriptionTotal: 0,
    }
  }

  it('새 스킬에 설명을 함께 보여준다', () => {
    const item: CatalogChange = { id: 'a', name: '스킬', authorName: null, version: '1.0.0', summary: '무엇을 하는 스킬인지' }
    const [line] = formatCreatedLines(digest([item], []), 'https://example.test')
    expect(line).toContain('무엇을 하는 스킬인지')
  })

  it('설명이 없으면 그 줄을 만들지 않는다 — 빈 자리를 남기지 않는다', () => {
    const item: CatalogChange = { id: 'a', name: '스킬', authorName: null, version: '1.0.0', summary: null }
    const [line] = formatCreatedLines(digest([item], []), 'https://example.test')
    expect(line).not.toContain('\n')
  })

  it('업데이트는 변경 요약을 버전 바로 뒤에 놓는다', () => {
    const item: CatalogChange = { id: 'a', name: '스킬', authorName: null, version: '1.1.0', summary: null, changeNote: '버그 수정' }
    const [line] = formatUpdatedLines(digest([], [item]), 'https://example.test')
    expect(line).toContain('v1.1.0 — 버그 수정')
  })

  it('변경 요약이 없으면 지어내지 않고 비운다', () => {
    const item: CatalogChange = { id: 'a', name: '스킬', authorName: null, version: '1.1.0', summary: null, changeNote: null }
    const [line] = formatUpdatedLines(digest([], [item]), 'https://example.test')
    expect(line).not.toContain('—')
  })
})

describe('shortSummary', () => {
  it('비어 있으면 null이다 — 없는 설명을 지어내지 않는다', () => {
    expect(shortSummary('')).toBeNull()
    expect(shortSummary('   ')).toBeNull()
    expect(shortSummary(null)).toBeNull()
  })

  it('줄바꿈과 연속 공백을 한 칸으로 만든다', () => {
    expect(shortSummary('앞\n\n  뒤')).toBe('앞 뒤')
  })

  it('길어도 여기서는 자르지 않는다 — 줄이는 것은 compactDescription이 맡는다', () => {
    const long = '가'.repeat(100)
    expect(shortSummary(long)).toHaveLength(100)
  })
})

describe('설명 채우기 요청 구역', () => {
  /**
   * 요청 목록만 채운 집계
   *
   * @param rows - 목록에 실을 항목
   * @param total - 전체 수
   */
  function digest(rows: MissingDescription[], total = rows.length): PopularSkillDigest {
    return {
      since: '2026-08-31T00:00:00.000Z',
      until: '2026-09-07T00:00:00.000Z',
      totalApplies: 0, distinctSkills: 0, top: [], firstTimers: [], created: [], updated: [],
      missingDescriptions: rows,
      missingDescriptionTotal: total,
    }
  }

  it('만든 사람을 적는다 — 누가 채워야 하는지가 요점이다', () => {
    const [line] = formatMissingDescriptionLines(
      digest([{ id: 'a', name: '스킬', authorName: '현진우', recentApplies: 0 }]),
      'https://example.test'
    )
    expect(line).toContain('현진우')
    expect(line).toContain('<https://example.test/skill/a|스킬>')
  })

  it('쓰이고 있으면 그것을 숫자로 보인다 — 더 급하다', () => {
    const [line] = formatMissingDescriptionLines(
      digest([{ id: 'a', name: '스킬', authorName: null, recentApplies: 12 }]),
      'https://example.test'
    )
    expect(line).toContain('최근 30일 12회 사용')
  })

  it('안 쓰이면 사용 횟수를 적지 않는다 — 0회를 굳이 보이지 않는다', () => {
    const [line] = formatMissingDescriptionLines(
      digest([{ id: 'a', name: '스킬', authorName: null, recentApplies: 0 }]),
      'https://example.test'
    )
    expect(line).not.toContain('회 사용')
  })

  it('잘라 실었으면 남은 수를 알린다', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`, name: `스킬${i}`, authorName: null, recentApplies: 0,
    }))
    const lines = formatMissingDescriptionLines(digest(rows, 8), 'https://example.test')
    expect(lines[lines.length - 1]).toContain('외 3개')
  })

  it('전부 실었으면 남은 수를 적지 않는다', () => {
    const rows = [{ id: 'a', name: '스킬', authorName: null, recentApplies: 0 }]
    const lines = formatMissingDescriptionLines(digest(rows, 1), 'https://example.test')
    expect(lines).toHaveLength(1)
  })
})

describe('자동 요약 표시', () => {
  /** 세 구역을 채운 집계 */
  function digest(created: CatalogChange[], updated: CatalogChange[] = []): PopularSkillDigest {
    return {
      since: '2026-08-31T00:00:00.000Z',
      until: '2026-09-07T00:00:00.000Z',
      totalApplies: 0, distinctSkills: 0, top: [], firstTimers: [], created, updated,
      missingDescriptions: [], missingDescriptionTotal: 0,
    }
  }

  it('사람이 쓴 설명에는 표식을 붙이지 않는다', () => {
    const item: CatalogChange = {
      id: 'a', name: '스킬', authorName: null, version: '1.0.0',
      summary: '사람이 쓴 설명', summaryIsAuto: false,
    }
    const [line] = formatCreatedLines(digest([item]), 'https://example.test')
    expect(line).toContain('사람이 쓴 설명')
    expect(line).not.toContain('자동 요약')
  })

  it('본문에서 뽑은 것은 자동 요약이라고 밝힌다 — 사람이 쓴 것처럼 보이면 아무도 안 채운다', () => {
    const item: CatalogChange = {
      id: 'a', name: '스킬', authorName: null, version: '1.0.0',
      summary: '본문에서 뽑은 요약', summaryIsAuto: true,
    }
    const [line] = formatCreatedLines(digest([item]), 'https://example.test')
    expect(line).toContain('_(자동 요약)_')
  })

  it('요약이 아예 없으면 둘째 줄을 만들지 않는다', () => {
    const item: CatalogChange = {
      id: 'a', name: '스킬', authorName: null, version: '1.0.0',
      summary: null, summaryIsAuto: true,
    }
    const [line] = formatCreatedLines(digest([item]), 'https://example.test')
    expect(line).not.toContain('\n')
  })
})
