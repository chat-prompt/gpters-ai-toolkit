/** 공식 입력 누락·오염·만료, 기존 표시줄 보존, 중복 보고 및 재시도를 검증한다. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  claudeUsagePaths, extractClaudeQuota, inspectClaudeStatusline, installClaudeStatusline, readClaudeQuota,
  readClaudeStatuslineInstallation, readUsageJson, renderDefaultStatusline, uninstallClaudeStatusline, writeUsageJson,
} from '../../src/usage/claude-statusline.js'
import { readDailyUsageAggregate, writeDailyUsageAggregate } from '../../src/usage/usage-aggregate-cache.js'
import type { UsageRecord } from '../../src/usage/types.js'
import { readClaudeWeeklyLimit } from '../../src/usage/claude-code.js'
import { claudeReportDue, reportCollectedUsage, runAutomaticClaudeReport } from '../../src/usage/claude-auto-report.js'

const NOW = Date.parse('2026-09-07T08:00:00Z')
const RESET = NOW / 1000 + 86400
let home: string
let entry: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aitk-claude-'))
  entry = join(home, "repo's build with spaces.mjs")
  writeFileSync(entry, '')
  mkdirSync(join(home, '.claude'))
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

/** 테스트 전용 스냅샷은 임시 홈에만 쓴다. */
function snapshot(now = NOW) {
  const value = extractClaudeQuota({ rate_limits: { seven_day: { used_percentage: 0, resets_at: RESET } } }, now)!
  writeUsageJson(claudeUsagePaths(home).snapshot, value)
  return value
}

it('공식 주간 창의 실제 0%는 보존하고 다른 입력 필드는 저장하지 않는다', () => {
  const value = extractClaudeQuota({ cwd: '/private', transcript_path: '/secret', rate_limits: {
    five_hour: { used_percentage: 99, resets_at: RESET },
    seven_day: { used_percentage: 0, resets_at: RESET },
  } }, NOW)
  expect(value).toEqual({ version: 1, source: 'claude-code-statusline', capturedAt: new Date(NOW).toISOString(), usedPercent: 0, resetsAt: new Date(RESET * 1000).toISOString() })
})

it.each([null, {}, { rate_limits: null }, { rate_limits: { five_hour: { used_percentage: 4 } } }])('누락된 주간 창을 추정하지 않는다: %j', (input) => {
  expect(extractClaudeQuota(input, NOW)).toBeNull()
})

it.each([null, undefined, '', '15', true, NaN, -1, 101])('잘못된 사용률을 0으로 바꾸지 않는다: %j', (used) => {
  expect(extractClaudeQuota({ rate_limits: { seven_day: { used_percentage: used, resets_at: RESET } } }, NOW)).toBeNull()
})

it.each([null, undefined, String(RESET), NOW / 1000, Infinity, 1e30])('리셋이 누락·만료·잘못된 경우 수집하지 않는다: %j', (reset) => {
  expect(extractClaudeQuota({ rate_limits: { seven_day: { used_percentage: 25, resets_at: reset } } }, NOW)).toBeNull()
})

it('파일을 touch해도 오래된 공식 값을 되살리지 않고 OAuth 캐시로 후퇴하지 않는다', () => {
  snapshot()
  writeFileSync(join(home, '.claude/statusline-usage-cache.json'), JSON.stringify({ seven_day: { utilization: 75, resets_at: RESET } }))
  const later = NOW + 16 * 60_000
  utimesSync(claudeUsagePaths(home).snapshot, new Date(later), new Date(later))
  expect(readClaudeQuota(home, NOW)?.usedPercent).toBe(0)
  expect(readClaudeQuota(home, later)).toBeNull()
  expect(readClaudeWeeklyLimit(home, later)).toBeNull()
})

it.each([null, '', ' ', [], true])('레거시 캐시의 잘못된 사용률도 미수집이다: %j', (used) => {
  const path = join(home, '.claude/statusline-usage-cache.json')
  writeFileSync(path, JSON.stringify({ seven_day: { utilization: used, resets_at: RESET } }))
  utimesSync(path, new Date(NOW), new Date(NOW))
  expect(readClaudeWeeklyLimit(home, NOW)).toBeNull()
})

describe('statusLine 설치', () => {
  it('명령·padding·다른 설정을 보존하고 반복 설치와 repo 경로 변경 후에도 원본으로 복원한다', () => {
    const paths = claudeUsagePaths(home)
    const previous = { type: 'command', command: 'cat | original-renderer', padding: 2 }
    writeUsageJson(paths.settings, { statusLine: previous, language: 'ko' })
    installClaudeStatusline(entry, home, '/node path/node')
    const first = readClaudeStatuslineInstallation(home)!
    expect(first.previous).toEqual(previous)
    expect(first.command).toContain("'\"'\"'")
    installClaudeStatusline(entry, home, '/node path/node')
    expect(readClaudeStatuslineInstallation(home)).toEqual(first)
    installClaudeStatusline(entry, home, '/new/node')
    expect(readClaudeStatuslineInstallation(home)?.previous).toEqual(previous)
    const settings = readUsageJson(paths.settings) as Record<string, unknown>
    writeUsageJson(paths.settings, { ...settings, theme: 'dark' })
    expect(uninstallClaudeStatusline(home)).toBe(true)
    expect(readUsageJson(paths.settings)).toEqual({ statusLine: previous, language: 'ko', theme: 'dark' })
  })
  it('상태 표시줄이 없었다면 제거 시 원래의 없음으로 돌아간다', () => {
    installClaudeStatusline(entry, home)
    expect(uninstallClaudeStatusline(home)).toBe(true)
    expect(readUsageJson(claudeUsagePaths(home).settings)).toEqual({})
  })
  it('설치 후 사용자가 바꾼 명령을 uninstall이 덮어쓰지 않는다', () => {
    installClaudeStatusline(entry, home)
    writeUsageJson(claudeUsagePaths(home).settings, { statusLine: { type: 'command', command: 'new-user-renderer' } })
    expect(uninstallClaudeStatusline(home)).toBe(false)
    installClaudeStatusline(entry, home)
    expect(readClaudeStatuslineInstallation(home)?.previous?.command).toBe('new-user-renderer')
  })
  it('기존 표시줄이 있으면 표시 모드를 묻지 않고 감싼다', () => {
    writeUsageJson(claudeUsagePaths(home).settings, { statusLine: { type: 'command', command: 'cat | original-renderer' } })
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'user', command: 'cat | original-renderer' })
    expect(installClaudeStatusline(entry, home, undefined, { display: 'none' }).mode).toBe('wrapped')
    expect(readClaudeStatuslineInstallation(home)?.display).toBeUndefined()
    expect(inspectClaudeStatusline(home)).toMatchObject({ kind: 'aitk', previous: { command: 'cat | original-renderer' } })
  })
  it('표시줄이 없으면 고른 표시 모드를 저장하고 재설치에서 유지한다', () => {
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'none' })
    expect(installClaudeStatusline(entry, home, undefined, { display: 'none' }).mode).toBe('none')
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'aitk', previous: null, display: 'none' })
    expect(installClaudeStatusline(entry, home).mode).toBe('unchanged')
    expect(readClaudeStatuslineInstallation(home)?.display).toBe('none')
    expect(installClaudeStatusline(entry, home, undefined, { display: 'default' }).mode).toBe('default')
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'aitk', previous: null, display: 'default' })
    expect(uninstallClaudeStatusline(home)).toBe(true)
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'none' })
  })
  it('표시 모드가 없는 파일럿 설치본은 기본 표시로 읽고 손상된 모드는 거부한다', () => {
    installClaudeStatusline(entry, home)
    const receipt = readClaudeStatuslineInstallation(home)!
    writeUsageJson(claudeUsagePaths(home).installation, { version: 1, command: receipt.command, previous: null })
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'aitk', previous: null, display: 'default' })
    writeUsageJson(claudeUsagePaths(home).installation, { ...receipt, display: 'fancy' })
    expect(readClaudeStatuslineInstallation(home)).toBeNull()
  })
  it('command 형식이 아닌 statusLine은 unsupported로 보고 건드리지 않는다', () => {
    writeUsageJson(claudeUsagePaths(home).settings, { statusLine: 'not-an-object' })
    expect(inspectClaudeStatusline(home)).toEqual({ kind: 'unsupported' })
    expect(() => installClaudeStatusline(entry, home)).toThrow()
  })
  it('잘못된 settings.json은 덮어쓰지 않는다', () => {
    const path = claudeUsagePaths(home).settings
    writeFileSync(path, '{ malformed')
    expect(() => installClaudeStatusline(entry, home)).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{ malformed')
  })
})

describe('기본 표시줄', () => {
  it('공식 입력에 있는 값만 그리고 주간 한도는 검증된 스냅샷을 우선한다', () => {
    const quota = extractClaudeQuota({ rate_limits: { seven_day: { used_percentage: 31.5, resets_at: RESET } } }, NOW)
    expect(renderDefaultStatusline({
      model: { display_name: 'Claude Test' }, transcript_path: '/private/conversation',
      context_window: { used_percentage: 42.4 },
      rate_limits: { five_hour: { used_percentage: 12 }, seven_day: { used_percentage: 99, resets_at: RESET } },
    }, quota)).toBe('Claude Test · ctx 42% · 5h 12% · 7d 32%')
  })
  it.each([null, {}, '{broken', { model: {} }])('입력이 비어도 모델 이름만으로 한 줄을 만든다: %j', (input) => {
    expect(renderDefaultStatusline(input)).toBe('Claude Code')
  })
  it('범위 밖·문자열 퍼센트는 표시하지 않는다', () => {
    expect(renderDefaultStatusline({ model: { display_name: 'M' }, context_window: { used_percentage: '40' }, rate_limits: { five_hour: { used_percentage: 120 } } })).toBe('M')
  })
})

describe('공식 한도 수신 후 자동 보고', () => {
  it('여러 세션이 동시에 갱신해도 한 번만 보고하고 성공한 날에는 집계하지 않는다', async () => {
    snapshot()
    let count = 0
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const report = async () => { count++; await pending }
    const first = runAutomaticClaudeReport(home, report, () => NOW)
    expect(await runAutomaticClaudeReport(home, report, () => NOW)).toBe(false)
    finish()
    expect(await first).toBe(true)
    expect(await runAutomaticClaudeReport(home, report, () => NOW + 600_000)).toBe(false)
    expect(count).toBe(1)
    expect(claudeReportDue({ lastSuccessAt: new Date(NOW).toISOString() }, NOW + 86400_000)).toBe(true)
  })
  it('인증·전송 실패를 성공으로 기록하지 않고 5분 후 재시도한다', async () => {
    snapshot()
    expect(await runAutomaticClaudeReport(home, async () => { throw new Error('Auth required. secret must not be saved') }, () => NOW)).toBe(false)
    const state = readUsageJson(claudeUsagePaths(home).report) as Record<string, unknown>
    expect(state.lastSuccessAt).toBeUndefined()
    expect(state.lastError).toBe('auth_required')
    expect(JSON.stringify(state)).not.toContain('secret')
    expect(await runAutomaticClaudeReport(home, async () => { throw new Error('should not run') }, () => NOW + 60_000)).toBe(false)
    expect(await runAutomaticClaudeReport(home, async () => {}, () => NOW + 300_000)).toBe(true)
  })
  it('공식 입력이 아직 없거나 만료됐으면 보고 작업을 실행하지 않는다', async () => {
    let calls = 0
    const report = async () => { calls++ }
    expect(await runAutomaticClaudeReport(home, report, () => NOW)).toBe(false)
    snapshot()
    expect(await runAutomaticClaudeReport(home, report, () => NOW + 16 * 60_000)).toBe(false)
    expect(calls).toBe(0)
  })
})


it('한도가 바뀌면 5분 후 두 클라이언트를 다시 집계한다', async () => {
  const record: UsageRecord = {
    client: 'claude-code', plan: 'Claude Max', planRaw: 'max',
    periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-09-08T00:00:00.000Z',
    inputTokens: 100, outputTokens: 20, cachedTokens: 300, sessions: 4, models: { claude: 420 },
    limitUsedPercent: 0, limitResetsAt: new Date(RESET * 1000).toISOString(),
  }
  let now = NOW
  let scans = 0
  const sent: UsageRecord[][] = []
  const collect = async () => { scans++; return [{ ...record, inputTokens: scans * 100 }, { ...record, client: 'codex' as const, limitUsedPercent: scans === 1 ? 33 : 2 }] }
  const send = async (records: UsageRecord[]) => { sent.push(records) }
  const report = () => reportCollectedUsage(home, () => now, collect, send)
  snapshot()
  expect(await runAutomaticClaudeReport(home, report, () => now)).toBe(true)
  now += 60_000
  const updated = { ...snapshot(now), usedPercent: 27 }
  writeUsageJson(claudeUsagePaths(home).snapshot, updated)
  expect(await runAutomaticClaudeReport(home, report, () => now)).toBe(false)
  now = NOW + 300_000
  expect(await runAutomaticClaudeReport(home, report, () => now)).toBe(true)
  expect(scans).toBe(2)
  expect(sent.map(rows => rows[0].limitUsedPercent)).toEqual([0, 27])
  expect(sent[1][0].inputTokens).toBe(200)
  expect(sent[1][1].limitUsedPercent).toBe(2)
  expect(sent[1][0].sessions).toBe(4)
  expect(claudeReportDue({ lastSuccessAt: new Date(now).toISOString(), lastQuotaKey: `27|${updated.resetsAt}` }, now + 600_000, `27|${updated.resetsAt}`)).toBe(false)
  expect(readDailyUsageAggregate(home, NOW + 86400_000)).toBeNull()
  writeDailyUsageAggregate([{ ...record, inputTokens: NaN }], home, now)
  expect(readDailyUsageAggregate(home, now)).toBeNull()
})


it('손상된 자동 보고 상태 파일이 다음 보고를 막지 않는다', async () => {
  snapshot()
  writeUsageJson(claudeUsagePaths(home).report, { lastSuccessAt: {}, lastAttemptAt: true })
  expect(await runAutomaticClaudeReport(home, async () => {}, () => NOW)).toBe(true)
})


it('공식 수집 설치 후 첫 응답을 기다릴 때도 레거시 OAuth 캐시를 쓰지 않는다', () => {
  const path = join(home, '.claude/statusline-usage-cache.json')
  writeFileSync(path, JSON.stringify({ seven_day: { utilization: 75, resets_at: RESET } }))
  utimesSync(path, new Date(NOW), new Date(NOW))
  installClaudeStatusline(entry, home)
  expect(readClaudeWeeklyLimit(home, NOW)).toBeNull()
})


it('한도가 같아도 한 시간 뒤 재집계하고 과거 성공이 새 실패의 재시도를 막지 않는다', () => {
  const success = { lastSuccessAt: new Date(NOW).toISOString(), lastQuotaKey: 'same' }
  expect(claudeReportDue(success, NOW + 3600_000, 'same')).toBe(true)
  const failure = { ...success, lastAttemptAt: new Date(NOW + 60_000).toISOString(), lastError: 'report_failed' as const }
  expect(claudeReportDue(failure, NOW + 359_999, 'same')).toBe(false)
  expect(claudeReportDue(failure, NOW + 360_000, 'same')).toBe(true)
})

it('기존 일일 캐시를 무시하고 새 사용량과 새 Codex 한도를 보고한다', async () => {
  const old: UsageRecord = { client: 'claude-code', plan: null, planRaw: null, periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-09-08T00:00:00Z', inputTokens: 100, outputTokens: 0, cachedTokens: 0, sessions: 1, models: { test: 100 }, limitUsedPercent: 33, limitResetsAt: new Date(RESET * 1000).toISOString() }
  writeDailyUsageAggregate([old, { ...old, client: 'codex' }], home, NOW)
  snapshot()
  let sent: UsageRecord[] = []
  await reportCollectedUsage(home, () => NOW, async () => [
    { ...old, inputTokens: 200 }, { ...old, client: 'codex', inputTokens: 300, limitUsedPercent: 2 },
  ], async rows => { sent = rows })
  expect(sent.map(row => row.inputTokens)).toEqual([200, 300])
  expect(sent[1].limitUsedPercent).toBe(2)
})
