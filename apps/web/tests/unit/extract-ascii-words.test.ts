/**
 * extractAsciiWords 단위 테스트 (DEV-4697)
 *
 * 스킬 ID·영문 이름을 단어 단위로 맞추려고 검색어에서 뽑는 영문 단어 목록을 확인한다.
 */
import { describe, it, expect } from 'vitest'
import { extractAsciiWords } from '../../../../packages/lib/src/search/vector-search'

describe('extractAsciiWords', () => {
  it('조사가 붙은 영문 단어도 단어만 남긴다', () => {
    expect(extractAsciiWords('이 PR을 리뷰해줘')).toEqual(['pr'])
  })

  it('점·플러스가 든 기술 이름은 한 단어로 유지하고 끝의 마침표는 뗀다', () => {
    expect(extractAsciiWords('Next.js랑 C++ 배포. PR.')).toEqual(['next.js', 'c++', 'pr'])
  })

  it('1글자 단어와 중복은 버리고, 한글만 있으면 빈 배열이다', () => {
    expect(extractAsciiWords('a PR pr 리뷰')).toEqual(['pr'])
    expect(extractAsciiWords('회의록 정리')).toEqual([])
  })

  it('하이픈이 든 스킬 ID는 조사가 붙어도 한 단어로 남는다', () => {
    expect(extractAsciiWords('write-post로 글 써줘')).toEqual(['write-post'])
  })
})
