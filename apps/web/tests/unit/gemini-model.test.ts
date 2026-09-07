/**
 * Gemini 모델 이름이 한 군데로 모여 있는지 확인한다.
 *
 * 2026-09-07에 `gemini-2.0-flash`와 `gemini-2.5-flash`가 둘 다 폐기돼 404가 났다.
 * 두 호출부가 **다른 이름을 들고 있으면 한쪽만 고치고 끝난다** — 실제로 그렇게 한 번 놓쳤다.
 *
 * 실패가 조용하다는 점이 더 문제다. 두 함수 다 실패를 null로 삼키고 호출부는 요약이 없으면
 * 생략하므로, 알림은 멀쩡해 보이면서 요약만 사라진다.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** `packages/lib/src/notifications` 경로 */
const DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'lib', 'src', 'notifications')

/**
 * 파일에서 모델 이름 상수를 읽는다.
 *
 * @param file - 파일 이름
 * @returns 찾은 모델 이름들
 */
function modelNames(file: string): string[] {
  const source = readFileSync(join(DIR, file), 'utf8')
  return [...source.matchAll(/'(gemini-[\w.-]+)'/g)].map((match) => match[1])
}

describe('Gemini 모델 이름', () => {
  it('두 호출부가 같은 이름을 쓴다 — 한쪽만 고치고 끝나지 않게', () => {
    const fromSlack = modelNames('slack.ts')
    const fromChangeNote = modelNames('change-note.ts')
    expect(fromSlack.length).toBeGreaterThan(0)
    expect(fromChangeNote.length).toBeGreaterThan(0)
    expect(new Set([...fromSlack, ...fromChangeNote]).size).toBe(1)
  })

  it('폐기된 이름을 쓰지 않는다', () => {
    // 2026-09-07 운영 로그에서 404를 확인한 이름들
    const RETIRED = ['gemini-2.0-flash', 'gemini-2.5-flash']
    const all = [...modelNames('slack.ts'), ...modelNames('change-note.ts')]
    for (const name of all) expect(RETIRED).not.toContain(name)
  })
})
