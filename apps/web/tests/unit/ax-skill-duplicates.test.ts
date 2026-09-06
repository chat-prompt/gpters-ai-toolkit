/**
 * 카탈로그 내부 중복 탐지 단위 테스트.
 *
 * 이 패널의 핵심 주장은 두 가지다 — 후보를 좁히는 스케치가 진짜 중복을 놓치지 않는다는 것,
 * 그리고 화면에 나가는 유사도는 절단 없는 정확값이라는 것. 둘 다 여기서 고정한다.
 */

import { describe, expect, it } from 'vitest'
import {
  bottomKSketch,
  findDuplicatePairs,
  groupDuplicates,
  sketchOverlap,
  type DuplicateCandidate,
} from '../../../../packages/lib/src/features/ax/skill-duplicates'
import { trigramSimilarity } from '../../../../packages/lib/src/features/ax/skill-diff'

function candidate(id: string, doc: string, applies = 0): DuplicateCandidate {
  return { id, name: id, authorName: null, applies, doc }
}

/** 8,000자를 넘기는 공통 도입부 — 절단 비교가 오탐을 내는 조건을 재현한다 */
const LONG_INTRO = 'shared onboarding preamble for the imported workflow toolkit. '.repeat(200)

describe('findDuplicatePairs', () => {
  it('같은 문서가 다른 id로 등록된 것을 찾는다', () => {
    const doc = '# Create DOCX\nUse python-docx to build the document and validate the output.'
    const pairs = findDuplicatePairs([
      candidate('community-docx', doc),
      candidate('create-docx', doc),
      candidate('unrelated-skill', '# Slack bot\nCollect mentions from the workspace API.'),
    ])

    expect(pairs).toHaveLength(1)
    expect([pairs[0].left.id, pairs[0].right.id].sort()).toEqual(['community-docx', 'create-docx'])
    expect(pairs[0].identical).toBe(true)
  })

  it('도입부만 같고 본론이 다른 긴 문서를 중복으로 올리지 않는다', () => {
    // 8,000자 절단 비교로는 두 문서가 같아 보인다. 운영에서 gstack 계열 36쌍이 이 형태였다.
    const ship = `${LONG_INTRO} ship step: tag the release, push the build, announce it.`
    const retro = `${LONG_INTRO} retro step: gather the incident notes, list what to change.`

    // 절단하면 완전히 같다 — 이게 오탐의 원인이다
    expect(trigramSimilarity(ship, retro)).toBe(1)
    // 패널은 절단 없이 비교하므로 두 문서를 가른다
    expect(trigramSimilarity(ship, retro, Infinity)).toBeLessThan(1)

    const pairs = findDuplicatePairs([candidate('gstack-ship', ship), candidate('gstack-retro', retro)])
    for (const pair of pairs) {
      expect(pair.identical).toBe(false)
    }
  })

  it('내려보내는 유사도는 스케치 추정값이 아니라 정확값이다', () => {
    const left = '# Review\nCheck the diff, run the tests, then summarise the findings for the author.'
    const right = '# Review\nCheck the diff, run the tests, then summarise the findings for the team.'
    const pairs = findDuplicatePairs([candidate('review-a', left), candidate('review-b', right)])

    expect(pairs).toHaveLength(1)
    expect(pairs[0].similarity).toBe(trigramSimilarity(left, right, Infinity))
  })

  it('본문이 짧거나 비어도 터지지 않는다', () => {
    expect(findDuplicatePairs([candidate('a', ''), candidate('b', 'x')])).toEqual([])
  })
})

describe('sketchOverlap', () => {
  it('같은 문서는 1, 완전히 다른 문서는 낮게 추정한다', () => {
    const doc = 'the quick brown fox jumps over the lazy dog and then keeps running'
    expect(sketchOverlap(bottomKSketch(doc), bottomKSketch(doc))).toBe(1)
    expect(
      sketchOverlap(bottomKSketch(doc), bottomKSketch('완전히 다른 한국어 문서입니다 겹치는 부분이 없습니다'))
    ).toBeLessThan(0.3)
  })

  it('빈 스케치는 0으로 떨어뜨린다 — 비교 대상이 없으면 후보가 아니다', () => {
    expect(sketchOverlap([], bottomKSketch('some content here'))).toBe(0)
  })
})

describe('groupDuplicates', () => {
  it('셋 이상이 같은 문서면 한 묶음으로 잇는다', () => {
    const doc = '# XLSX\nRead and write spreadsheets with openpyxl and validate the sheet names.'
    const pairs = findDuplicatePairs([
      candidate('community-xlsx', doc),
      candidate('create-xlsx', doc),
      candidate('xlsx-processor', doc),
      candidate('slack-bot', '# Slack\nPost a message to the channel using the bot token from the vault.'),
    ])

    const groups = groupDuplicates(pairs)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual(['community-xlsx', 'create-xlsx', 'xlsx-processor'])
  })

  it('서로 이어지지 않는 중복은 별개 묶음으로 둔다', () => {
    const docx = '# DOCX\nBuild the Word document, then convert it and check the tracked changes.'
    const pptx = '# PPTX\nBuild the slide deck, then export it and check the speaker notes.'
    const groups = groupDuplicates(
      findDuplicatePairs([
        candidate('community-docx', docx),
        candidate('create-docx', docx),
        candidate('community-pptx', pptx),
        candidate('create-pptx', pptx),
      ])
    )

    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.length === 2)).toBe(true)
  })

  it('쌍이 없으면 묶음도 없다', () => {
    expect(groupDuplicates([])).toEqual([])
  })
})
