import { describe, expect, test } from 'claude-code/testing'

const ISSUE = { id: 'EDU-1', title: '앱 패널 제목', status: 'In Progress', statusType: 'started', project: 'P', url: 'https://linear.app/x/EDU-1' }
const PANE = { component: 'Pane', requestId: 'linear-issues', props: { bodyColumns: 60 } }

describe('linear pane', () => {
  test('앱에서는 여백·링크·새로고침 버튼으로 그린다', async ($, on) => {
    on('mcp.call', () => ({ value: { isError: false, content: [{ type: 'text', text: JSON.stringify({ issues: [ISSUE] }) }] } }))
    on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
    on('session.root', () => ({ value: '/work' }))
    on('command.register', () => ({ value: undefined }) as any)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await $.command.run({ command: 'linear', args: '' } as any)

    const desk = await $.ui.mount({ plugin: 'linear-issues', surface: 'desktop', ...PANE } as any)
    expect(await desk.find({ type: 'Link' })).toBeDefined()
    expect(await desk.find({ type: 'Text', text: '앱 패널 제목' })).toBeDefined() // 직접 자르지 않는다
    expect(await desk.find({ type: 'Button', key: 'refresh' })).toBeDefined()

    const term = await $.ui.mount({ plugin: 'linear-issues', surface: 'terminal', ...PANE } as any)
    expect(await term.find({ type: 'Link' })).toBeUndefined() // 터미널 모양은 그대로
  })
})
