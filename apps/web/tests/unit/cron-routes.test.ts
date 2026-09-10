/**
 * vercel.json에 등록한 크론 경로가 실제 라우트로 존재하는지 확인한다.
 *
 * 경로만 등록하고 라우트 파일을 다른 위치에 두면 배포는 성공하고 크론만 매일 404를 받는다.
 * 실패가 조용해서 사람이 눈치채지 못한다 — 2026-09-07에 `catalog-health-snapshot`이
 * `packages/db/apps/web/...` 아래에 들어가 있는 것을 발견했다. 그래서 여기서 막는다.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CRON_EXPECTATIONS } from '../../../../packages/lib/src/ops'
import { INDEPENDENTLY_WATCHED_CRONS } from '../../../../packages/lib/src/ops/cron-registry'

/** 앱 루트 — 이 테스트 파일 기준 `apps/web` */
const APP_ROOT = join(__dirname, '..', '..')

/** vercel.json의 크론 한 줄 */
interface CronEntry {
  path: string
  schedule: string
}

/**
 * vercel.json에 등록된 크론 목록을 읽는다.
 *
 * @returns 등록된 크론 항목
 */
async function readCronEntries(): Promise<CronEntry[]> {
  const raw = await readFile(join(APP_ROOT, 'vercel.json'), 'utf8')
  return (JSON.parse(raw) as { crons?: CronEntry[] }).crons ?? []
}

describe('vercel cron 등록', () => {
  it('등록된 모든 경로에 라우트 파일이 있다', async () => {
    const entries = await readCronEntries()
    expect(entries.length).toBeGreaterThan(0)

    // 쿼리스트링은 같은 라우트를 다른 인자로 부르는 것이라 떼고 본다
    const missing = entries
      .map((entry) => entry.path.split('?')[0])
      .filter((path) => !existsSync(join(APP_ROOT, 'app', `${path}`, 'route.ts')))

    expect(missing).toEqual([])
  })
})

describe('크론 감시 레지스트리', () => {
  // 감시 자신은 스스로를 볼 수 없으므로 기대치 목록에 없다
  const SELF = '/api/cron/cron-health'

  it('등록된 크론이 전부 감시 대상이다', async () => {
    const entries = await readCronEntries()
    const registered = new Set([...CRON_EXPECTATIONS.map((entry) => entry.jobName),...INDEPENDENTLY_WATCHED_CRONS.map(entry=>entry.jobName)])
    for (const entry of INDEPENDENTLY_WATCHED_CRONS) expect(existsSync(join(APP_ROOT,'../..',entry.watchdog))).toBe(true)
    const unwatched = entries
      .map((entry) => entry.path.split('?')[0])
      .filter((path) => path !== SELF)
      .map((path) => path.replace('/api/cron/', ''))
      .filter((jobName) => !registered.has(jobName))

    expect([...new Set(unwatched)]).toEqual([])
  })

  it('감시 대상이 전부 실제로 등록된 크론이다 — 사라진 잡을 계속 기다리지 않는다', () => {
    const entries = CRON_EXPECTATIONS.map((entry) => entry.jobName)
    const missing = entries.filter(
      (jobName) => !existsSync(join(APP_ROOT, 'app', 'api', 'cron', jobName, 'route.ts'))
    )
    expect(missing).toEqual([])
  })
})
