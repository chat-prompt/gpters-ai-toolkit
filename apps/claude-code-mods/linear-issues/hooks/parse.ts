import type { McpToolResult } from 'claude-code'

import type { Issue } from '../types'

export const NO_PROJECT = '프로젝트 없음'
// 진행에 가까운 상태가 위로 온다.
const RANK: Record<string, number> = { started: 0, unstarted: 1, backlog: 2, triage: 3 }
const rank = (i: Issue) => RANK[i.statusType] ?? 9

// list_issues 결과(JSON 텍스트 블록)에서 끝나지 않은 이슈만 남긴다.
export function parseIssues(result: McpToolResult): Issue[] {
  if (result.isError) throw new Error(result.content.map(b => b.text ?? '').join(' ') || 'Linear 호출 실패')
  const text = result.content.find(b => b.type === 'text')?.text ?? '{"issues":[]}'
  const { issues } = JSON.parse(text) as { issues: Issue[] }

  return issues
    .filter(i => i.statusType !== 'completed' && i.statusType !== 'canceled')
    .map(({ id, title, status, statusType, project, url }) => ({ id, title, status, statusType, project: project ?? null, url }))
}

export type Group = { project: string; statuses: { status: string; issues: Issue[] }[] }

// 프로젝트 → 상태 순으로 묶는다. 진행 중 이슈가 많은 프로젝트가 위, 프로젝트 없음은 맨 아래.
export function groupIssues(list: Issue[]): Group[] {
  const byProject = new Map<string, Issue[]>()
  for (const i of [...list].sort((a, b) => rank(a) - rank(b) || a.status.localeCompare(b.status))) {
    const key = i.project ?? NO_PROJECT
    byProject.set(key, [...(byProject.get(key) ?? []), i])
  }
  const started = (g: Issue[]) => g.filter(i => i.statusType === 'started').length

  return [...byProject]
    .sort(([a, ga], [b, gb]) => Number(a === NO_PROJECT) - Number(b === NO_PROJECT) || started(gb) - started(ga) || a.localeCompare(b))
    .map(([project, issues]) => {
      const byStatus = new Map<string, Issue[]>()
      for (const i of issues) byStatus.set(i.status, [...(byStatus.get(i.status) ?? []), i])
      return { project, statuses: [...byStatus].map(([status, issues]) => ({ status, issues })) }
    })
}

// 한글·한자·이모지는 터미널 두 칸.
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u

const width = (c: string) => (WIDE.test(c) ? 2 : 1)

// 칸 수 cols 안에 들도록 자르고, 잘랐으면 끝에 …를 붙인다.
export function fit(text: string, cols: number): string {
  const chars = [...text]
  if (chars.reduce((n, c) => n + width(c), 0) <= cols) return text
  let out = ''
  let used = 0
  for (const c of chars) {
    if (used + width(c) > cols - 1) break
    out += c
    used += width(c)
  }
  return `${out}…`
}

