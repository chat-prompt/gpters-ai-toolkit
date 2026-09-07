/**
 * 지난 주에 실제로 쓰인 스킬을 팀에 알린다 (DEV-4280).
 *
 * ## 왜 "신규"가 아니라 "인기"인가
 *
 * DEV-4280은 원래 "신규·인기 스킬 알림"이었는데, **신규 배포 알림은 이미 있다** —
 * 스킬을 올리면 `notifySlackDeploy`가 그 자리에서 `#toolkit-알림`에 보낸다.
 * 실제로 없던 것은 "그래서 그중 뭐가 쓰이고 있나"다.
 *
 * 카탈로그 466개 중 로드 0건이 64%, 적용 0건이 80%라 **병목은 발견이 아니라 선별**이다
 * (DEV-4275). 새로 올라온 것을 더 알리는 대신, 동료가 실제로 써 본 것을 보여주는 편이
 * 선별을 돕는다.
 *
 * ## 무엇을 세는가
 *
 * `apply`만 센다 — 에이전트의 명시적인 적용 보고다. 검색 노출이나 로드는 "열어봤다"이지
 * "썼다"가 아니다. 비율은 쓰지 않고 건수와 사람 수만 적는다. 표본이 작을 때 백분율은
 * 실제보다 강한 주장을 하기 때문이다.
 *
 * ## 조용할 땐 보내지 않는다
 *
 * 적용이 한 건도 없으면 아무것도 보내지 않는다. 매주 "0건"을 보내면 그 채널을 아무도 안 읽게
 * 되고, 그러면 진짜 알림도 같이 묻힌다 — evo가 매일 "생성 0건"을 보내며 그렇게 됐다.
 */

import { catalogItems, db, skillEvents } from '@gpters/db'
import { and, eq, gte, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('popular-skills')

/** 알림에 싣는 최대 스킬 수 */
const TOP_LIMIT = 5

/** 이 인원 이상이 쓴 스킬은 "여러 사람이 쓴다"고 말할 수 있다 */
const SHARED_MIN_USERS = 2

/** 한 스킬의 지난 주 사용 */
export interface PopularSkill {
  skillId: string
  name: string
  /** 적용 보고 건수 */
  applies: number
  /** 적용한 서로 다른 사용자 수 */
  users: number
  /** 이 스킬이 처음 적용된 것이 이번 창 안인가 */
  isFirstTime: boolean
}

/** 한 주의 집계 */
export interface PopularSkillDigest {
  since: string
  until: string
  /** 창 안의 전체 적용 건수 */
  totalApplies: number
  /** 창 안에 한 번이라도 적용된 스킬 수 */
  distinctSkills: number
  /** 적용 순 상위 */
  top: PopularSkill[]
  /** 이번 창에서 처음 적용된 스킬 */
  firstTimers: PopularSkill[]
}

/**
 * 지난 `days`일 동안 실제로 적용된 스킬을 모은다.
 *
 * @param days - 집계 창 (일)
 * @param now - 기준 시각. 테스트에서 고정한다
 * @returns 집계 결과
 */
export async function collectPopularSkills(days = 7, now = new Date()): Promise<PopularSkillDigest> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      skillId: skillEvents.skillId,
      name: catalogItems.name,
      applies: sql<number>`count(*)::int`,
      users: sql<number>`count(distinct ${skillEvents.userId})::int`,
      // 이 창 이전에 적용된 적이 있는지. 없으면 이번이 처음이다
      earlierApplies: sql<number>`(
        select count(*)::int from ${skillEvents} prior
        where prior.skill_id = ${skillEvents.skillId}
          and prior.action = 'apply'
          and prior.created_at < ${since}
      )`,
    })
    .from(skillEvents)
    .leftJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
    .where(and(eq(skillEvents.action, 'apply'), gte(skillEvents.createdAt, since)))
    .groupBy(skillEvents.skillId, catalogItems.name)

  const skills: PopularSkill[] = rows
    .filter((row) => row.skillId !== null)
    .map((row) => ({
      skillId: row.skillId as string,
      // 카탈로그에서 지워진 스킬의 이벤트가 남아 있을 수 있다 — id로라도 부른다
      name: row.name ?? (row.skillId as string),
      applies: Number(row.applies ?? 0),
      users: Number(row.users ?? 0),
      isFirstTime: Number(row.earlierApplies ?? 0) === 0,
    }))

  const digest: PopularSkillDigest = {
    since: since.toISOString(),
    until: now.toISOString(),
    totalApplies: skills.reduce((sum, skill) => sum + skill.applies, 0),
    distinctSkills: skills.length,
    top: rankSkills(skills).slice(0, TOP_LIMIT),
    firstTimers: rankSkills(skills.filter((skill) => skill.isFirstTime)).slice(0, TOP_LIMIT),
  }

  log.info('Collected popular skills', {
    days,
    totalApplies: digest.totalApplies,
    distinctSkills: digest.distinctSkills,
  })
  return digest
}

/**
 * 사용 순으로 줄 세운다.
 *
 * 사람 수를 먼저 본다 — 한 사람이 열 번 쓴 것보다 세 사람이 한 번씩 쓴 쪽이
 * 팀에 권할 근거가 된다.
 *
 * @param skills - 줄 세울 스킬
 * @returns 정렬된 새 배열
 */
export function rankSkills(skills: PopularSkill[]): PopularSkill[] {
  return [...skills].sort(
    (a, b) => b.users - a.users || b.applies - a.applies || a.skillId.localeCompare(b.skillId)
  )
}

/**
 * 집계를 Slack 본문 줄로 바꾼다.
 *
 * 비율을 쓰지 않는다 — 표본이 작을 때 백분율은 실제보다 강한 주장을 한다.
 *
 * @param digest - 집계 결과
 * @param baseUrl - 스킬 상세 링크의 앞부분
 * @returns 사람이 읽는 줄들
 */
export function formatDigestLines(digest: PopularSkillDigest, baseUrl: string): string[] {
  return digest.top.map((skill) => {
    const link = `<${baseUrl}/skill/${skill.skillId}|${skill.name}>`
    const shared = skill.users >= SHARED_MIN_USERS ? `${skill.users}명` : '1명'
    const badge = skill.isFirstTime ? ' · 이번 주 첫 사용' : ''
    return `• ${link} — 적용 ${skill.applies}회 · ${shared}${badge}`
  })
}
