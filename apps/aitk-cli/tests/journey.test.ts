import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createJourneyId,
  markJourneyReported,
  rememberExecutionAttempt,
  rememberLoadJourney,
  rememberSearchJourney,
  resolveJourneyForAttempt,
  resolveJourneyForLoad,
  resolveJourneyForSkill,
} from '../src/journey.js'

describe('sessionless skill journey state', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aitk-journey-test-'))
    process.env.AITK_JOURNEY_STATE_DIR = directory
  })

  afterEach(async () => {
    delete process.env.AITK_JOURNEY_STATE_DIR
    await rm(directory, { recursive: true, force: true })
  })

  it('검색→로드→실행을 연결하되 민감한 본문과 평문 스킬 ID를 저장하지 않는다', async () => {
    const journeyId = createJourneyId()
    const attemptId = '11111111-1111-4111-8111-111111111111'

    await rememberSearchJourney(journeyId, ['eli5-visual', 'review-helper'])
    expect(await resolveJourneyForLoad('eli5-visual')).toBe(journeyId)

    await rememberLoadJourney(journeyId, 'eli5-visual')
    expect(await resolveJourneyForSkill('eli5-visual')).toBe(journeyId)

    await rememberExecutionAttempt(attemptId, journeyId, 'eli5-visual')
    expect(await resolveJourneyForAttempt(attemptId, 'eli5-visual')).toBe(journeyId)

    await markJourneyReported(journeyId)
    expect(await resolveJourneyForSkill('eli5-visual')).toBeNull()

    const stored = await readFile(join(directory, 'state.json'), 'utf8')
    expect(stored).not.toContain('eli5-visual')
    expect(stored).not.toContain('review-helper')
    expect(stored).not.toContain('검색어')
  })
})
