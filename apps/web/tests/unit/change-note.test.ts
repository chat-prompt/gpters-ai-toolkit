/**
 * 변경 요약 다듬기 테스트.
 *
 * 모델에 "명사형 한 마디"를 부탁해도 문장이 오거나 따옴표가 붙어 올 수 있다.
 * 그럴 때 **자르는 것보다 안 쓰는 편이 낫다** — 잘린 문장은 뜻이 바뀐다.
 */

import { describe, expect, it } from 'vitest'
import { NOTE_MAX, firstSentence, normalizeChangeNote, parseBatchResponse } from '../../../../packages/lib/src/notifications/change-note'

describe('normalizeChangeNote', () => {
  it('명사형 한 마디는 그대로 쓴다', () => {
    expect(normalizeChangeNote('버그 수정')).toBe('버그 수정')
  })

  it('따옴표와 마침표를 걷어낸다', () => {
    expect(normalizeChangeNote('"문체 개선."')).toBe('문체 개선')
    expect(normalizeChangeNote('`파일 추가`')).toBe('파일 추가')
  })

  it('줄바꿈을 한 칸으로 만든다', () => {
    expect(normalizeChangeNote('규칙\n정리')).toBe('규칙 정리')
  })

  it('다듬기만 하고 길이는 호출부가 판정한다 — 변경 요약과 설명 압축의 상한이 다르다', () => {
    const long = '이번 주에는 클릭 데이터 해석을 정정하고 구독자 수를 갱신했습니다'
    const result = normalizeChangeNote(long)
    expect(result).toBe(long)
    // 호출부는 이 길이를 보고 버린다
    expect(result!.length).toBeGreaterThan(NOTE_MAX)
  })

  it('빈 응답은 null이다', () => {
    expect(normalizeChangeNote('')).toBeNull()
    expect(normalizeChangeNote('   ')).toBeNull()
    expect(normalizeChangeNote(null)).toBeNull()
    expect(normalizeChangeNote(undefined)).toBeNull()
  })
})

describe('firstSentence', () => {
  it('첫 문장만 남긴다', () => {
    expect(firstSentence('앞 문장이다. 뒤 문장은 버린다.')).toBe('앞 문장이다')
  })

  it('문장 부호가 없으면 통째로 보되 길면 자른다', () => {
    const long = '가'.repeat(80)
    const result = firstSentence(long)
    expect(result).toHaveLength(46)
    expect(result?.endsWith('…')).toBe(true)
  })

  it('비어 있으면 null이다 — 없는 설명을 지어내지 않는다', () => {
    expect(firstSentence('')).toBeNull()
    expect(firstSentence(null)).toBeNull()
  })
})

describe('parseBatchResponse', () => {
  it('JSON 객체를 키→문구로 읽는다', () => {
    expect(parseBatchResponse('{"a":"버그 수정","b":"문체 개선"}')).toEqual({ a: '버그 수정', b: '문체 개선' })
  })

  it('코드 울타리를 걷어낸다', () => {
    expect(parseBatchResponse('```json\n{"a":"버그 수정"}\n```')).toEqual({ a: '버그 수정' })
  })

  it('문자열이 아닌 값은 버린다', () => {
    expect(parseBatchResponse('{"a":"좋음","b":123,"c":null}')).toEqual({ a: '좋음' })
  })

  it('못 읽으면 빈 것으로 본다 — 억지로 해석하지 않는다', () => {
    expect(parseBatchResponse('이건 JSON이 아니다')).toEqual({})
    expect(parseBatchResponse('[1,2,3]')).toEqual({})
    expect(parseBatchResponse('')).toEqual({})
    expect(parseBatchResponse(null)).toEqual({})
  })
})
