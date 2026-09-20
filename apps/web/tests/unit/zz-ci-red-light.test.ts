import { it, expect } from 'vitest'
// DEV-4476: CI 가 실패를 잡는지 확인하는 임시 테스트. 확인 후 되돌린다.
it('fails on purpose', () => { expect(1).toBe(2) })
