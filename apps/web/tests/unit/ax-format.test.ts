import { describe, expect, it } from 'vitest'
import {
  RATE_MIN_SAMPLE,
  formatSampledRate,
  relativeActivityFill,
  tooltipAnchorClass,
} from '../../components/ax/format'

describe('relativeActivityFill', () => {
  it('0은 비활동 색으로, 양수의 최소·중간·최대는 25%~100% 상대 농도로 바꾼다', () => {
    expect(relativeActivityFill(0, 2, 10)).toBe('var(--border-subtle)')
    expect(relativeActivityFill(2, 2, 10)).toContain('30.0%')
    expect(relativeActivityFill(6, 2, 10)).toContain('79.5%')
    expect(relativeActivityFill(10, 2, 10)).toContain('100.0%')
  })

  it('양수 값이 하나뿐이면 최댓값 색으로 표시한다', () => {
    expect(relativeActivityFill(3, 3, 3)).toBe('var(--accent-orange)')
  })
})

describe('formatSampledRate', () => {
  it('분모가 없으면 0%로 꾸미지 않고 대시를 돌려준다', () => {
    expect(formatSampledRate(0, 0)).toBe('—')
    expect(formatSampledRate(3, -1)).toBe('—')
  })

  it('최소 표본 미만이면 백분율 대신 분수와 참고 표시를 돌려준다', () => {
    expect(RATE_MIN_SAMPLE).toBe(10)
    expect(formatSampledRate(1, 4)).toBe('1/4 · 참고')
    expect(formatSampledRate(9, 9)).toBe('9/9 · 참고')
    expect(formatSampledRate(1, 4, 3)).toBe('25.0%')
  })

  it('표본이 충분하면 소수점 한 자리 백분율을 돌려준다', () => {
    expect(formatSampledRate(3, 40)).toBe('7.5%')
    expect(formatSampledRate(10, 10)).toBe('100.0%')
    expect(formatSampledRate(1234, 5678)).toBe('21.7%')
  })
})

describe('tooltipAnchorClass', () => {
  it('가장자리 막대는 안쪽으로, 가운데 막대는 중앙에 툴팁을 붙인다', () => {
    expect(tooltipAnchorClass(0, 7)).toBe('left-0')
    expect(tooltipAnchorClass(1, 7)).toBe('left-0')
    expect(tooltipAnchorClass(3, 7)).toBe('left-1/2 -translate-x-1/2')
    expect(tooltipAnchorClass(6, 7)).toBe('right-0')
    expect(tooltipAnchorClass(0, 1)).toBe('left-0')
  })
})
