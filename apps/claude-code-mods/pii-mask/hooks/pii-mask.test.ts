import { test, expect } from 'claude-code/testing'
import { configure, isExternal, maskText, strictReason } from './mask'

// 테스트용 가짜 관리자·워크스페이스. 실제 값은 userConfig 로 받는다.
const ADMIN = { piiAllowedIds: 'U0ADMIN0001, U0ADMIN0002', homeWorkspaceId: 'T0HOME00001' }

test('휴대폰 번호는 뒤 4자리만 남긴다', () => {
  expect(maskText('연락처 010-1234-5678 / 01098765432 / +82 10-2222-3333')).toBe(
    '연락처 010-****-5678 / 010-****-5432 / 010-****-3333',
  )
})

test('이메일은 첫 글자와 도메인만 남긴다', () => {
  expect(maskText('hong.gildong@gmail.com, tatha@gpters.org')).toBe('h***@gmail.com, t***@gpters.org')
})

test('주민번호 뒷자리를 가린다', () => {
  expect(maskText('900101-1234567')).toBe('900101-*******')
})

test('토큰·키를 가린다', () => {
  const out = maskText(
    'Authorization: Bearer 392aad51-c248-4ebf-bc79-7b9a973a6609\nAIRTABLE_API_KEY=patAbCdEfGhIjK.0123456789abcdef0123456789abcdef\n{"token": "xoxb-1234567890-abcdefghij"}',
  )
  expect(out).not.toContain('392aad51')
  expect(out).not.toContain('patAbCdEfGhIjK')
  expect(out).not.toContain('xoxb-1234567890')
})

test('일에 필요한 값은 그대로 둔다', () => {
  const s = '24기 결제 Success 3건, 금액 299000, 레코드 recAbc123, 2026-10-16 03:10'
  expect(maskText(s)).toBe(s)
})

test('Bash 결과가 Claude에게 가기 전에 가려진다', async ($, on) => {
  // 엔진 자리: 실제 도구 대신 개인정보가 담긴 출력을 돌려준다
  on('tool.call', async () => ({
    result: { stdout: '홍길동 010-1234-5678 hong@gmail.com', stderr: '', interrupted: false },
  }))
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  await $.prompt.submit({ text: '{"channel": "discord"}' } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'airtable-read 홍길동' } as never)
  const stdout = (r as { result: { stdout: string } }).result.stdout
  expect(stdout).toBe('홍길동 010-****-5678 h***@gmail.com')
  expect((r as { context?: readonly string[] }).context?.[0]).toContain('pii-mask')
})

test('메시지를 아직 못 봤으면 번호까지 가린다', async ($, on) => {
  on('tool.call', async () => ({ result: { stdout: '010-1234-5678', stderr: '', interrupted: false } }))
  const r = await $.tool.call({ tool: 'Bash', command: 'x' } as never)
  expect((r as { result: { stdout: string } }).result.stdout).toBe('010-****-5678')
})

test('가릴 게 없으면 결과를 그대로 넘긴다', async ($, on) => {
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  const r = await $.tool.call({ tool: 'Bash', command: 'echo ok' } as never)
  expect((r as { context?: unknown }).context).toBeUndefined()
})

test('secrets 모드는 토큰만 가리고 번호·메일은 남긴다', () => {
  expect(maskText('010-1234-5678 a@b.com Bearer abcdefghijklmnop1234', {}, 'secrets')).toBe(
    '010-1234-5678 a@b.com Bearer [토큰 가림]',
  )
})

test('외부 채널 판별', () => {
  configure({})
  expect(isExternal('{"channel": "discord", "provider": "discord"}')).toBe(true)
  expect(isExternal('{"chat_id":"channel:1560350655166550067","message_id":"1"}')).toBe(true)
  expect(isExternal('{"chat_id":"channel:C0TEST00001"}')).toBe(false)
  expect(isExternal('{"channel":"slack"}')).toBe(false)
  expect(isExternal('그냥 터미널 질문')).toBe(false)
})

test('슬랙 세션에서는 번호를 남기고 토큰만 가린다', async ($, on) => {
  on('tool.call', async () => ({ result: { stdout: '010-1234-5678 AIRTABLE_API_KEY=patAbCdEfGhIjK.0123456789abcdef0123', stderr: '', interrupted: false } }))
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  await $.prompt.submit({ text: '{"channel":"slack"} 조회해줘' } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'x' } as never)
  expect((r as { result: { stdout: string } }).result.stdout).toBe('010-1234-5678 AIRTABLE_API_KEY=[토큰 가림]')
})

test('디스코드 프롬프트가 한 번 오면 그 세션은 번호까지 가린다', async ($, on) => {
  on('tool.call', async () => ({ result: { stdout: '010-1234-5678', stderr: '', interrupted: false } }))
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  await $.prompt.submit({ text: '{"channel": "discord"} 조회해줘' } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'x' } as never)
  expect((r as { result: { stdout: string } }).result.stdout).toBe('010-****-5678')
})

const slack = (id: string, extra = '') => `{"chat_id":"channel:C0TEST00001","sender":{"id":"${id}","name":"x"${extra}}}`

test('설정이 비면 관리자 ID도 권한 없는 요청자로 본다', () => {
  configure({})
  expect(strictReason(slack('U0ADMIN0001'))).toBe('개인정보 권한 없는 요청자')
})

test('슬랙: 관리자 요청은 개인정보를 남긴다 (쉼표·공백 구분 둘 다)', () => {
  configure(ADMIN)
  expect(strictReason(slack('U0ADMIN0001'))).toBeNull()
  expect(strictReason(slack('U0ADMIN0002'))).toBeNull()
})

test('슬랙: 권한 없는 팀원 요청은 개인정보까지 가린다', () => {
  configure(ADMIN)
  expect(strictReason(slack('U0MEMBER001'))).toBe('개인정보 권한 없는 요청자')
})

test('슬랙: 형제봇 요청은 업무로 본다', () => {
  configure(ADMIN)
  expect(strictReason(slack('U0BOT000001', ',"is_bot":true'))).toBeNull()
})

test('슬랙: 우리 워크스페이스 관리자는 남기고, 외부 워크스페이스는 전부 가린다', () => {
  configure(ADMIN)
  expect(strictReason('{"chat_id":"channel:C1","sender":{"id":"U0ADMIN0001"},"group_space":"T0HOME00001"}')).toBeNull()
  expect(strictReason('{"chat_id":"channel:C1","sender":{"id":"U0ADMIN0001"},"group_space":"T0OTHER0001"}')).toBe('외부 워크스페이스')
})

test('가림모드를 말하면 관리자여도 가린다', () => {
  configure(ADMIN)
  expect(strictReason(slack('U0ADMIN0001') + ' 가림모드로 내 정보 조회해줘')).toBe('가림모드 요청')
})

test('userConfig 관리자가 시키면 결과 번호를 남긴다', { options: ADMIN }, async ($, on) => {
  on('tool.call', async () => ({ result: { stdout: '010-1234-5678', stderr: '', interrupted: false } }))
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  await $.prompt.submit({ text: slack('U0ADMIN0001') + ' 회원 조회해줘' } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'x' } as never)
  expect((r as { result: { stdout: string } }).result.stdout).toBe('010-1234-5678')
})

test('슬랙 실제 흐름: 권한 없는 팀원이 시키면 결과 번호가 가려진다', { options: ADMIN }, async ($, on) => {
  on('tool.call', async () => ({ result: { stdout: '010-1234-5678 hong@gmail.com', stderr: '', interrupted: false } }))
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  await $.prompt.submit({ text: slack('U0MEMBER001') + ' 회원 조회해줘' } as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'x' } as never)
  expect((r as { result: { stdout: string } }).result.stdout).toBe('010-****-5678 h***@gmail.com')
})
