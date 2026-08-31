/**
 * 세션 없는 CLI 호출 사이의 스킬 여정을 최소 정보로 연결한다.
 *
 * 검색어, 프롬프트, 응답 본문, 절대 경로는 저장하지 않는다. 스킬 ID도 해시로만
 * 보관하며, 상태 파일 오류는 관찰 기능만 포기하고 실제 명령은 계속 실행한다.
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STATE_VERSION = 1
const JOURNEY_TTL_MS = 24 * 60 * 60 * 1000
const MAX_JOURNEYS = 100

interface StoredJourney {
  journeyId: string
  skillHashes: string[]
  loadedSkillHash?: string
  createdAt: string
  updatedAt: string
  outcomeReported?: boolean
}

interface StoredAttempt {
  attemptId: string
  journeyId: string
  skillHash: string
  createdAt: string
}

interface JourneyState {
  version: 1
  journeys: StoredJourney[]
  attempts: StoredAttempt[]
}

function stateDirectory(): string {
  return process.env.AITK_JOURNEY_STATE_DIR ?? join(homedir(), '.cache', 'gpters-aitk', 'skill-journeys')
}

function statePath(): string {
  return join(stateDirectory(), 'state.json')
}

function emptyState(): JourneyState {
  return { version: STATE_VERSION, journeys: [], attempts: [] }
}

function skillHash(skillId: string): string {
  return createHash('sha256').update(skillId).digest('hex')
}

function isFresh(timestamp: string, now = Date.now()): boolean {
  const value = Date.parse(timestamp)
  return Number.isFinite(value) && now - value <= JOURNEY_TTL_MS
}

function prune(state: JourneyState): JourneyState {
  const now = Date.now()
  const journeys = state.journeys
    .filter((journey) => isFresh(journey.updatedAt, now))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_JOURNEYS)
  const ids = new Set(journeys.map((journey) => journey.journeyId))
  const attempts = state.attempts.filter((attempt) => ids.has(attempt.journeyId) && isFresh(attempt.createdAt, now))
  return { version: STATE_VERSION, journeys, attempts }
}

async function readState(): Promise<JourneyState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(), 'utf8')) as Partial<JourneyState>
    if (parsed.version !== STATE_VERSION || !Array.isArray(parsed.journeys) || !Array.isArray(parsed.attempts)) {
      return emptyState()
    }
    return prune(parsed as JourneyState)
  } catch {
    return emptyState()
  }
}

async function writeState(state: JourneyState): Promise<void> {
  try {
    const directory = stateDirectory()
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const target = statePath()
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(prune(state), null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, target)
  } catch {
    // Telemetry linkage is best-effort and must never break the user command.
  }
}

function latest<T extends { updatedAt?: string; createdAt: string }>(items: T[]): T | undefined {
  return items.sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt))[0]
}

export function createJourneyId(): string {
  return randomUUID()
}

export async function rememberSearchJourney(journeyId: string, skillIds: string[]): Promise<void> {
  const state = await readState()
  const now = new Date().toISOString()
  state.journeys = state.journeys.filter((journey) => journey.journeyId !== journeyId)
  state.journeys.push({
    journeyId,
    skillHashes: [...new Set(skillIds.map(skillHash))],
    createdAt: now,
    updatedAt: now,
  })
  await writeState(state)
}

export async function resolveJourneyForLoad(skillId: string, explicitJourneyId?: string): Promise<string> {
  if (explicitJourneyId) return explicitJourneyId
  const state = await readState()
  const hash = skillHash(skillId)
  const match = latest(state.journeys.filter((journey) => !journey.loadedSkillHash && journey.skillHashes.includes(hash)))
  return match?.journeyId ?? createJourneyId()
}

export async function rememberLoadJourney(journeyId: string, skillId: string): Promise<void> {
  const state = await readState()
  const now = new Date().toISOString()
  const existing = state.journeys.find((journey) => journey.journeyId === journeyId)
  if (existing) {
    existing.loadedSkillHash = skillHash(skillId)
    existing.updatedAt = now
  } else {
    state.journeys.push({
      journeyId,
      skillHashes: [skillHash(skillId)],
      loadedSkillHash: skillHash(skillId),
      createdAt: now,
      updatedAt: now,
    })
  }
  await writeState(state)
}

export async function resolveJourneyForSkill(skillId: string, explicitJourneyId?: string): Promise<string | null> {
  if (explicitJourneyId) return explicitJourneyId
  const state = await readState()
  const hash = skillHash(skillId)
  return latest(state.journeys.filter((journey) => journey.loadedSkillHash === hash && !journey.outcomeReported))?.journeyId ?? null
}

export async function rememberExecutionAttempt(attemptId: string, journeyId: string | null, skillId: string): Promise<void> {
  if (!journeyId) return
  const state = await readState()
  state.attempts = state.attempts.filter((attempt) => attempt.attemptId !== attemptId)
  state.attempts.push({
    attemptId,
    journeyId,
    skillHash: skillHash(skillId),
    createdAt: new Date().toISOString(),
  })
  await writeState(state)
}

export async function resolveJourneyForAttempt(attemptId: string | undefined, skillId: string, explicitJourneyId?: string): Promise<string | null> {
  if (explicitJourneyId) return explicitJourneyId
  if (attemptId) {
    const state = await readState()
    const match = state.attempts.find((attempt) => attempt.attemptId === attemptId && attempt.skillHash === skillHash(skillId))
    if (match) return match.journeyId
  }
  return resolveJourneyForSkill(skillId)
}

export async function markJourneyReported(journeyId: string | null): Promise<void> {
  if (!journeyId) return
  const state = await readState()
  const journey = state.journeys.find((item) => item.journeyId === journeyId)
  if (journey) {
    journey.outcomeReported = true
    journey.updatedAt = new Date().toISOString()
    await writeState(state)
  }
}
