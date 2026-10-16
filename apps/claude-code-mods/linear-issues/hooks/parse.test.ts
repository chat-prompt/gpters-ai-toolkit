import { expect, test } from 'claude-code/testing'

import { fit, groupIssues, NO_PROJECT, parseIssues } from './parse'

const raw = (statusType: string, id: string, project: string | null = 'P', status = statusType) =>
  ({ id, title: 't', status, statusType, project, url: 'u' })

test('끝난 이슈는 빼고 나머지만 남긴다', () => {
  const text = JSON.stringify({ issues: [raw('started', 'A-1'), raw('completed', 'A-2'), raw('canceled', 'A-3'), raw('unstarted', 'A-4')] })
  const got = parseIssues({ content: [{ type: 'text', text }], isError: false })
  expect(got.map(i => i.id)).toEqual(['A-1', 'A-4'])
})

test('MCP 오류는 던진다', () => {
  expect(() => parseIssues({ content: [{ type: 'text', text: 'boom' }], isError: true })).toThrow()
})

test('프로젝트 → 상태로 묶고, 진행 중 많은 프로젝트가 위, 프로젝트 없음은 맨 아래', () => {
  const got = groupIssues([
    raw('backlog', 'A-1', 'A', 'Backlog'),
    raw('started', 'N-1', null, 'In Progress'),
    raw('unstarted', 'B-1', 'B', 'Todo'),
    raw('started', 'B-2', 'B', 'In Progress'),
    raw('started', 'B-3', 'B', 'In Review'),
  ])
  expect(got.map(g => g.project)).toEqual(['B', 'A', NO_PROJECT])
  expect(got[0]!.statuses.map(s => s.status)).toEqual(['In Progress', 'In Review', 'Todo'])
})

test('fit은 칸 수에 맞춰 자르고 …를 붙인다', () => {
  expect(fit('abc', 5)).toBe('abc')
  expect(fit('abcdef', 5)).toBe('abcd…')
  expect(fit('가나다라', 5)).toBe('가나…')
  expect(fit('가나', 4)).toBe('가나')
})

