import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { fit, groupIssues, parseIssues } from './parse'
import type { Issue } from '../types'

const PANE = 'linear-issues'
const OPEN_STATES = ['started', 'unstarted', 'backlog', 'triage']
const issues = atom({ plugin: 'linear-issues', key: 'issues' } as const, [])
const error = atom({ plugin: 'linear-issues', key: 'error' } as const, null)
const updatedAt = atom({ plugin: 'linear-issues', key: 'updatedAt' } as const, null)
// 개인 설정(userConfig). /config 또는 settings.json pluginConfigs 에서 바꾼다.
let REFRESH_MS = 5 * 60 * 1000
let SERVER = 'linear'
// 세션을 이 아래에서 시작했을 때만 패널을 저절로 연다(비우면 안 연다). /linear 는 어디서나 된다.
let AUTO_OPEN = ''
// 세션 시작 직후엔 Linear MCP 가 아직 붙지 않았다. 그동안은 오류 대신 불러오는 중으로 두고 다시 시도한다.
const RETRY_MS = 3000
const RETRIES = 20

let polling = false

async function refresh($: EngineInterface, tries = 0) {
  try {
    // 최근 수정순 N개를 받아 거르면 끝난 이슈에 밀려 오래된 미완료가 빠진다. 열린 상태별로 따로 받는다.
    const results = await Promise.all(
      OPEN_STATES.map(state =>
        $.mcp.call(SERVER, 'list_issues', {
          assignee: 'me',
          state,
          limit: 250,
          fields: ['id', 'title', 'status', 'statusType', 'project', 'url'],
        }),
      ),
    )
    await update($, issues, () => results.flatMap(parseIssues))
    await update($, error, () => null)
  } catch (err) {
    const message = String((err as Error).message ?? err)
    if (message.includes('no connected MCP') && tries < RETRIES) {
      await $.clock.sleep(RETRY_MS)
      return refresh($, tries + 1)
    }
    await update($, error, () => message)
  }
  await update($, updatedAt, () => Date.now())
}

async function show($: EngineInterface, focus: boolean) {
  await $.ui.open(focus ? { id: PANE, title: 'Linear', focus: true } : { id: PANE, title: 'Linear' })
  if (!polling) {
    polling = true
    $.clock.every(REFRESH_MS, () => void refresh($))
  }
  await refresh($)
}

const insert = ($: EngineInterface, issue: { id: string; title: string }) =>
  void $.prompt.fill({ text: `${issue.id} ${issue.title} `, mode: 'insert' })

// 앱 패널에서 접어 둔 프로젝트. 다시 불러오면 모두 펼친다.
const collapsed = new Set<string>()
const DOT: Record<string, string> = { started: 'yellow', unstarted: 'blue', backlog: 'gray', triage: 'red' }

function toggle($: EngineInterface, project: string) {
  if (!collapsed.delete(project)) collapsed.add(project)
  $.ui.invalidate('ui.render')
}

// 앱(데스크톱 등)용: 들여쓰기는 여백으로, 자르기는 앱에 맡기고, 프로젝트는 접을 수 있게.
function desktopPane($: EngineInterface, e: RenderInput<'Pane'>, list: Issue[], err: string | null, at: number | null) {
  const { Box, Button, Link, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      {err && <Text color="red" wrap="wrap">불러오기 실패: {err}</Text>}
      {at === null && <Text dimColor>불러오는 중…</Text>}
      {at !== null && !err && list.length === 0 && <Text dimColor>열린 이슈가 없어요.</Text>}
      {groupIssues(list).map(g => {
        const open = !collapsed.has(g.project)
        const count = g.statuses.reduce((n, s) => n + s.issues.length, 0)
        return (
          <Box key={`p:${g.project}`} flexDirection="column">
            <Button plain key={`p:${g.project}`} onPress={() => toggle($, g.project)}>
              <Text bold>{open ? '▾' : '▸'} {g.project}</Text> <Text dimColor>{count}</Text>
            </Button>
            {open && g.statuses.map(s => (
              <Box key={`s:${g.project}:${s.status}`} flexDirection="column" paddingLeft={2} marginTop={1}>
                <Text wrap="truncate-end">
                  <Text color={DOT[s.issues[0]?.statusType ?? ''] ?? 'gray'}>●</Text> <Text dimColor>{s.status} · {s.issues.length}</Text>
                </Text>
                {s.issues.map(issue => (
                  <Box key={issue.id} flexDirection="row" columnGap={1} paddingLeft={2}>
                    <Box flexGrow={1} flexShrink={1}>
                      <Button plain key={issue.id} onPress={() => insert($, issue)}>
                        <Text color="blue">{issue.id}</Text> <Text>{issue.title}</Text>
                      </Button>
                    </Box>
                    <Link href={issue.url} label="↗" />
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )
      })}
      {at !== null && (
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>{new Date(at).toLocaleTimeString()} 갱신 · 누르면 프롬프트에 넣기</Text>
          <Button plain dimColor key="refresh" onPress={() => void refresh($)}>새로고침</Button>
        </Box>
      )}
    </Box>
  )
}

// ~ 를 HOME 으로 바꾸고 끝의 / 를 뗀다. HOME 을 모르면 ~ 경로는 '' (자동 열기 안 함).
function expand(path: string, home: string) {
  if (/^~(\/|$)/.test(path)) {
    if (!home) return ''
    path = home + path.slice(1)
  }
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}
const under = (root: string, dir: string) => root === '/' || dir === root || dir.startsWith(`${root}/`)

export const register: Register = (on, options) => {
  const minutes = Number(options.refreshMinutes)
  REFRESH_MS = (Number.isFinite(minutes) && minutes >= 1 ? Math.min(minutes, 1440) : 5) * 60 * 1000
  SERVER = String(options.mcpServer ?? '').trim() || 'linear'
  AUTO_OPEN = String(options.autoOpenPath ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'linear', description: '내 Linear 이슈 패널 열기·새로고침' })
    if (AUTO_OPEN) {
      const root = await $.session.root()
      const home = (await $.env.get('HOME')) ?? ''
      const dir = expand(AUTO_OPEN, home)
      if (dir && under(dir, root)) void show($, false)
    }

    return next(e)
  })

  on('command.run', { command: 'linear' }, async $ => {
    await show($, true)

    return { text: 'Linear 이슈를 새로고침했어요.' }
  })

  // 세션이 이슈 상태를 바꾸면(착수·완료 확정) 새로고침 간격을 기다리지 않고 바로 갱신한다. 패널이 열린 세션에서만.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (polling && String(e.tool) === `mcp__${SERVER.replace(/[^A-Za-z0-9_-]/g, '_')}__save_issue`) void refresh($)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, issues)
    const err = await read($, error)
    const at = await read($, updatedAt)
    if (e.surface !== 'terminal') return desktopPane($, e, list, err, at)
    const { Box, Button, Text } = $.ui.resolve(e)
    // Button은 안쪽 Text의 wrap을 따르지 않아 제목을 직접 패널 본문 폭에 맞춘다.
    const cols = e.props.bodyColumns

    return (
      <Box flexDirection="column">
        {err && <Text color="red" wrap="wrap">불러오기 실패: {err}</Text>}
        {at === null && <Text dimColor>불러오는 중…</Text>}
        {at !== null && !err && list.length === 0 && <Text dimColor>열린 이슈가 없어요.</Text>}
        {groupIssues(list).flatMap(g => [
          <Text bold color="cyan" wrap="truncate">▸ {g.project} ({g.statuses.reduce((n, s) => n + s.issues.length, 0)})</Text>,
          ...g.statuses.flatMap(s => [
            <Text dimColor wrap="truncate">  {s.status} · {s.issues.length}</Text>,
            ...s.issues.map(issue => (
              <Button plain key={issue.id} onPress={() => insert($, issue)}>
                <Text wrap="truncate">{'    '}<Text color="blue">{issue.id}</Text> {fit(issue.title, cols - 5 - issue.id.length)}</Text>
              </Button>
            )),
          ]),
        ])}
        {at !== null && <Text dimColor>{new Date(at).toLocaleTimeString()} 갱신 · /linear 새로고침 · 클릭하면 프롬프트에 넣기 · ctrl+x x 닫기</Text>}
      </Box>
    )
  })
}
