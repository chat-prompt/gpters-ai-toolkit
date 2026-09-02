import { describe, expect, it } from 'vitest'
import { relativeActivityFill } from '../../components/ax/format'

describe('relativeActivityFill', () => {
  it('0은 비활동 색으로, 양수의 최소·중간·최대는 25%~100% 상대 농도로 바꾼다', () => {
    expect(relativeActivityFill(0, 2, 10)).toBe('var(--border-subtle)')
    expect(relativeActivityFill(2, 2, 10)).toContain('25.0%')
    expect(relativeActivityFill(6, 2, 10)).toContain('78.0%')
    expect(relativeActivityFill(10, 2, 10)).toContain('100.0%')
  })

  it('양수 값이 하나뿐이면 최댓값 색으로 표시한다', () => {
    expect(relativeActivityFill(3, 3, 3)).toBe('var(--brand-primary)')
  })
})
