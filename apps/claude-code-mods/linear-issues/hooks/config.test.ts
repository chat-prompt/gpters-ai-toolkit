import { expect, test } from 'claude-code/testing'

// autoOpenPath 아래에서 시작한 세션만 패널을 저절로 연다.
for (const [root, opened] of [['/home/me/Projects/my-team/repo', true], ['/home/me/Projects/my-teamX', false]] as const) {
  test(`autoOpenPath ~/Projects/my-team, root ${root} → ${opened}`, { options: { autoOpenPath: '~/Projects/my-team', mcpServer: 'lin' } }, async ($, on) => {
    const calls: string[] = []
    let opens = 0
    on('env.get', () => ({ value: '/home/me' }) as any)
    on('mcp.call', (_$: any, e: any) => { calls.push(e.server); return { value: { isError: false, content: [{ type: 'text', text: '{"issues":[]}' }] } } })
    on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
    on('session.root', () => ({ value: root }))
    on('command.register', () => ({ value: undefined }) as any)
    on('ui.open', () => { opens++; return { value: { isPlaced: true } } })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: root } as any)
    await $.command.run({ command: 'linear', args: '' } as any)
    expect(opens).toBe(opened ? 2 : 1)
    expect(calls.every(s => s === 'lin')).toBe(true)
  })
}

test('HOME 이 없으면 ~/ 경로는 열지 않는다', { options: { autoOpenPath: '~/Projects' } }, async ($, on) => {
  let opens = 0
  on('env.get', () => ({ value: undefined }) as any)
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('session.root', () => ({ value: '/Projects/repo' }))
  on('command.register', () => ({ value: undefined }) as any)
  on('ui.open', () => { opens++; return { value: { isPlaced: true } } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/Projects/repo' } as any)
  expect(opens).toBe(0)
})

test('HOME 이 없으면 ~ 만으로는 열지 않고, 잘못된 간격은 5분으로', { options: { autoOpenPath: '~', refreshMinutes: 0 } }, async ($, on) => {
  let opens = 0
  const every: number[] = []
  on('env.get', () => ({ value: undefined }) as any)
  on('mcp.call', () => ({ value: { isError: false, content: [{ type: 'text', text: '{"issues":[]}' }] } }))
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('session.root', () => ({ value: '/anywhere' }))
  on('command.register', () => ({ value: undefined }) as any)
  on('ui.open', () => { opens++; return { value: { isPlaced: true } } })
  on('clock.every', ((_$: any, e: any) => { every.push(e.ms); return { value: undefined } }) as any)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/anywhere' } as any)
  expect(opens).toBe(0)
  await $.command.run({ command: 'linear', args: '' } as any)
  expect(every).toEqual([5 * 60 * 1000])
})
