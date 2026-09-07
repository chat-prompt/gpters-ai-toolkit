/**
 * 배포 시점 중복 경고 테스트.
 *
 * 지켜야 하는 것 — 같은 문서를 새 id로 올릴 때 잡을 것, 다른 문서는 잡지 않을 것,
 * 그리고 **막지 않을 것**(경고는 응답에 실릴 뿐 배포를 되돌리지 않는다).
 */

import { describe, expect, it } from 'vitest'
import {
  DEPLOY_SIMILARITY_THRESHOLD,
  buildDuplicateWarning,
  findDeployDuplicates,
  type ExistingDoc,
} from '../../../../packages/lib/src/features/ax/deploy-duplicate-guard'

const DOCX = `# DOCX 만들기
python-docx로 문서를 만들고 추적 변경 사항을 확인한 뒤 변환한다. 각주와 탭스톱도 지원한다.`

function existing(overrides: Partial<ExistingDoc> & { id: string }): ExistingDoc {
  return { name: overrides.id, content: DOCX, ...overrides }
}

describe('findDeployDuplicates', () => {
  it('같은 문서를 새 id로 올리면 잡는다 — 운영에서 3중복이 생긴 경로다', () => {
    const matches = findDeployDuplicates(DOCX, [
      existing({ id: 'community-docx' }),
      existing({ id: 'slack-bot', content: '# Slack\n워크스페이스 API로 멘션을 모은다.' }),
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('community-docx')
    expect(matches[0].nearIdentical).toBe(true)
  })

  it('머리말과 공백만 다른 문서도 같은 것으로 본다', () => {
    const withFrontmatter = `---\nname: create-docx\n---\n${DOCX.replace(/\n/g, '\n\n')}`
    const matches = findDeployDuplicates(withFrontmatter, [existing({ id: 'community-docx' })])
    expect(matches[0]?.nearIdentical).toBe(true)
  })

  it('내용이 다르면 잡지 않는다', () => {
    const matches = findDeployDuplicates('# Slack\n워크스페이스 API로 멘션을 모아 정리한다.', [
      existing({ id: 'community-docx' }),
    ])
    expect(matches).toEqual([])
  })

  it('본문을 자르지 않는다 — 도입부만 같은 긴 문서를 동일로 보지 않는다', () => {
    const intro = '가져온 워크플로 툴킷의 공통 안내 문단. '.repeat(400)
    const shipDoc = `${intro} ship 단계: 태그를 달고 빌드를 올리고 공지한다.`
    const retroDoc = `${intro} retro 단계: 사고 기록을 모아 바꿀 것을 적는다.`

    const matches = findDeployDuplicates(retroDoc, [existing({ id: 'gstack-ship', content: shipDoc })])
    for (const match of matches) {
      expect(match.nearIdentical).toBe(false)
    }
  })

  it('상위 3건까지만 돌려준다 — 사람이 판단할 수 있는 만큼', () => {
    const many = Array.from({ length: 6 }, (_, index) => existing({ id: `dup-${index}` }))
    expect(findDeployDuplicates(DOCX, many)).toHaveLength(3)
  })

  it('본문이 비었거나 짧으면 조용히 넘어간다', () => {
    expect(findDeployDuplicates('', [existing({ id: 'a' })])).toEqual([])
    expect(findDeployDuplicates(DOCX, [existing({ id: 'a', content: null })])).toEqual([])
  })

  it('경계는 카탈로그 중복 패널과 같은 0.5다', () => {
    expect(DEPLOY_SIMILARITY_THRESHOLD).toBe(0.5)
  })
})

describe('buildDuplicateWarning', () => {
  it('닮은 것이 없으면 경고를 만들지 않는다', () => {
    expect(buildDuplicateWarning([])).toBeNull()
  })

  it('업데이트하는 방법을 함께 준다 — 방법이 없으면 이름만 바꿔 다시 올린다', () => {
    const message = buildDuplicateWarning([
      { id: 'community-docx', name: 'DOCX', similarity: 0.99, nearIdentical: true },
    ])

    expect(message).toContain('community-docx')
    expect(message).toContain('0.99')
    expect(message).toContain('그 id로 다시 배포')
    // 의도적 분기까지 막지 않는다는 것을 문구가 밝혀야 한다
    expect(message).toContain('의도적으로')
  })

  it('사실상 동일할 때와 닮았을 때의 문구가 다르다', () => {
    const identical = buildDuplicateWarning([
      { id: 'a', name: 'a', similarity: 0.99, nearIdentical: true },
    ])
    const similar = buildDuplicateWarning([
      { id: 'a', name: 'a', similarity: 0.62, nearIdentical: false },
    ])

    expect(identical).toContain('사실상 같은 문서')
    expect(similar).toContain('상당히 닮았습니다')
  })
})
