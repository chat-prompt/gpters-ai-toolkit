/**
 * prepareTextForEmbedding 단위 테스트 (DEV-4697)
 *
 * 임베딩 입력에 이름·설명·태그만 들어가고 본문·readme는 빠지는지 확인한다.
 */
import { describe, it, expect } from 'vitest'
import { prepareTextForEmbedding } from '../../../../packages/lib/src/search/embedding'

describe('prepareTextForEmbedding', () => {
  it('이름·설명·태그만 결합하고 본문·readme는 넣지 않는다', () => {
    const item = {
      name: '코드 리뷰',
      description: 'PR diff를 검토한다',
      tags: ['review', 'github'],
      content: '## 단계\n1. 본문',
      readme: '사람용 소개',
    }
    expect(prepareTextForEmbedding(item)).toBe('코드 리뷰 PR diff를 검토한다 review github')
  })

  it('설명·태그가 비어도 이름만으로 텍스트를 만든다', () => {
    expect(prepareTextForEmbedding({ name: 'md2pdf', description: '', tags: null })).toBe('md2pdf')
  })
})
