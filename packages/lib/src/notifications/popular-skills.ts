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

import { catalogItems, db, itemVersions, skillEvents, users } from '@gpters/db'
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { compactDescription, summarizeChangeNote } from './change-note'

const log = createLogger('popular-skills')

/** 알림에 싣는 최대 항목 수 (구역마다) */
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

/** 카탈로그에 새로 올라왔거나 갱신된 항목 */
export interface CatalogChange {
  id: string
  name: string
  /** 표시용 저자 이름. 없으면 null */
  authorName: string | null
  /** 현재 버전 */
  version: string
  /** 갱신본에만 채운다 — 창 안에서 버전이 올라간 횟수 */
  bumps?: number
  /** 카탈로그에 적힌 한 줄 설명. 비어 있으면 null */
  summary: string | null
  /**
   * 갱신본에만 채운다 — 이번 주 변경을 명사형 한 마디로 (예: "버그 수정", "문체 개선").
   *
   * changelog를 요약한 값이다. 요약에 실패하거나 changelog가 비면 **null로 둔다.**
   * 지어내지 않는다.
   */
  changeNote?: string | null
}

/** 설명이 비어 있어 채워 달라고 알릴 스킬 */
export interface MissingDescription {
  id: string
  name: string
  /** 채워 줄 사람. 없으면 null */
  authorName: string | null
  /** 최근 30일 적용 건수 — 쓰이는데 설명이 없는 것이 더 급하다 */
  recentApplies: number
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
  /** 창 안에 새로 올라온 항목 */
  created: CatalogChange[]
  /** 창 안에 새 버전이 올라간 항목 (새로 올라온 것은 뺀다) */
  updated: CatalogChange[]
  /** 설명이 비어 있는 발행 스킬 */
  missingDescriptions: MissingDescription[]
  /** 설명이 빈 스킬의 전체 수 — 목록은 잘라 싣는다 */
  missingDescriptionTotal: number
}


/**
 * 카탈로그 설명의 공백을 정리한다.
 *
 * 줄이는 것은 `compactDescription`이 맡는다. 여기서는 **비었는지만 가른다** —
 * 없는 설명을 지어내지 않고, 빈 것은 `missingDescriptions`로 따로 모은다.
 *
 * @param description - 카탈로그에 적힌 설명
 * @returns 정리한 원문. 비어 있으면 null
 */
export function shortSummary(description: string | null | undefined): string | null {
  const text = (description ?? '').replace(/\s+/g, ' ').trim()
  return text === '' ? null : text
}

/**
 * 창 안에 새로 올라온 발행 항목을 읽는다.
 *
 * 초안은 뺀다 — 아직 팀에 권할 상태가 아니다.
 *
 * @param since - 창 시작
 * @returns 최근 등록 순
 */
async function collectCreated(since: Date): Promise<CatalogChange[]> {
  const rows = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      version: catalogItems.version,
      description: catalogItems.description,
      authorName: users.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(users.id, catalogItems.authorId))
    .where(
      and(
        gte(catalogItems.createdAt, since),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
    .orderBy(desc(catalogItems.createdAt))
    .limit(TOP_LIMIT)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    authorName: row.authorName ?? null,
    version: row.version ?? '1.0.0',
    summary: shortSummary(row.description),
  }))
}

/**
 * 창 안에 새 버전이 올라간 항목을 읽는다.
 *
 * `item_versions`가 버전마다 한 줄을 남기므로 그것을 센다. 한 주에 열 번 고친 스킬도
 * **한 줄로 묶고 횟수만 적는다** — 같은 스킬이 목록을 채우면 나머지가 안 보인다.
 *
 * @param since - 창 시작
 * @param excludeIds - 이미 "새로 올라옴"에 실린 id. 두 구역에 겹쳐 싣지 않는다
 * @returns 갱신 횟수 순
 */
async function collectUpdated(
  since: Date,
  excludeIds: Set<string>
): Promise<Array<CatalogChange & { changelogs: string[] }>> {
  const rows = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      version: catalogItems.version,
      description: catalogItems.description,
      authorName: users.name,
      bumps: sql<number>`count(${itemVersions.id})::int`,
      // 이번 주 변경 기록을 모아 한 마디로 줄일 재료로 쓴다
      changelogs: sql<string[]>`array_remove(array_agg(${itemVersions.changelog}), NULL)`,
    })
    .from(itemVersions)
    .innerJoin(catalogItems, eq(catalogItems.id, itemVersions.itemId))
    .leftJoin(users, eq(users.id, catalogItems.authorId))
    .where(
      and(
        gte(itemVersions.createdAt, since),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
    .groupBy(catalogItems.id, catalogItems.name, catalogItems.version, users.name)

  return rows
    .filter((row) => !excludeIds.has(row.id))
    .sort((a, b) => Number(b.bumps) - Number(a.bumps) || a.id.localeCompare(b.id))
    .slice(0, TOP_LIMIT)
    .map((row) => ({
      id: row.id,
      name: row.name,
      authorName: row.authorName ?? null,
      version: row.version ?? '1.0.0',
      bumps: Number(row.bumps ?? 0),
      summary: shortSummary(row.description),
      changelogs: (row.changelogs ?? []).filter((entry) => typeof entry === 'string' && entry.trim() !== ''),
    }))
}


/**
 * 설명이 비어 있는 발행 스킬을 읽는다.
 *
 * 설명이 없으면 검색 결과에서도 목록에서도 무엇을 하는 스킬인지 알 수 없다. **없는 설명을
 * 대신 지어내지 않고 만든 사람에게 채워 달라고 한다** — 무엇을 하는 스킬인지는 그 사람이 안다.
 *
 * 쓰이는데 설명이 없는 것이 더 급하므로 최근 적용 순으로 줄 세운다.
 *
 * @returns 목록(잘라서)과 전체 수
 */
async function collectMissingDescriptions(): Promise<{ rows: MissingDescription[]; total: number }> {
  const rows = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      authorName: users.name,
      recentApplies: sql<number>`(
        SELECT count(*)::int FROM ${skillEvents}
        WHERE ${skillEvents}."skill_id" = ${catalogItems}."id"
          AND ${skillEvents}."action" = 'apply'
          AND ${skillEvents}."created_at" > now() - interval '30 days'
      )`,
    })
    .from(catalogItems)
    .leftJoin(users, eq(users.id, catalogItems.authorId))
    .where(
      and(
        eq(catalogItems.type, 'skill'),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
        sql`coalesce(${catalogItems.description}, '') = ''`
      )
    )

  const sorted = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      authorName: row.authorName ?? null,
      recentApplies: Number(row.recentApplies ?? 0),
    }))
    .sort((a, b) => b.recentApplies - a.recentApplies || a.id.localeCompare(b.id))

  return { rows: sorted.slice(0, TOP_LIMIT), total: sorted.length }
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

  const createdRaw = await collectCreated(since)
  const updatedRaw = await collectUpdated(since, new Set(createdRaw.map((item) => item.id)))
  const missing = await collectMissingDescriptions()

  // 목록에 실을 것만 압축·요약한다 — 잘려 나갈 항목까지 모델을 부를 이유가 없다
  const created: CatalogChange[] = await Promise.all(
    createdRaw.map(async (item) => ({ ...item, summary: await compactDescription(item.summary) }))
  )
  const updated: CatalogChange[] = await Promise.all(
    updatedRaw.map(async ({ changelogs, ...item }) => ({
      ...item,
      summary: await compactDescription(item.summary),
      changeNote: await summarizeChangeNote(changelogs),
    }))
  )

  const digest: PopularSkillDigest = {
    since: since.toISOString(),
    until: now.toISOString(),
    totalApplies: skills.reduce((sum, skill) => sum + skill.applies, 0),
    distinctSkills: skills.length,
    top: rankSkills(skills).slice(0, TOP_LIMIT),
    firstTimers: rankSkills(skills.filter((skill) => skill.isFirstTime)).slice(0, TOP_LIMIT),
    created,
    updated,
    missingDescriptions: missing.rows,
    missingDescriptionTotal: missing.total,
  }

  log.info('Collected weekly skill digest', {
    days,
    totalApplies: digest.totalApplies,
    distinctSkills: digest.distinctSkills,
    created: created.length,
    updated: updated.length,
    missingDescriptions: missing.total,
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
 * 스킬 상세로 가는 Slack 링크
 *
 * @param baseUrl - 사이트 주소
 * @param id - 카탈로그 id
 * @param name - 표시 이름
 */
function skillLink(baseUrl: string, id: string, name: string): string {
  return `<${baseUrl}/skill/${id}|${name}>`
}

/**
 * 많이 쓴 스킬 구역.
 *
 * 비율을 쓰지 않는다 — 표본이 작을 때 백분율은 실제보다 강한 주장을 한다.
 *
 * @param digest - 집계 결과
 * @param baseUrl - 스킬 상세 링크의 앞부분
 * @returns 사람이 읽는 줄들
 */
export function formatDigestLines(digest: PopularSkillDigest, baseUrl: string): string[] {
  return digest.top.map((skill) => {
    const link = skillLink(baseUrl, skill.skillId, skill.name)
    const shared = skill.users >= SHARED_MIN_USERS ? `${skill.users}명` : '1명'
    const badge = skill.isFirstTime ? ' · 이번 주 첫 사용' : ''
    return `• ${link} — 적용 ${skill.applies}회 · ${shared}${badge}`
  })
}

/**
 * 새로 올라온 스킬 구역.
 *
 * @param digest - 집계 결과
 * @param baseUrl - 스킬 상세 링크의 앞부분
 * @returns 사람이 읽는 줄들
 */
export function formatCreatedLines(digest: PopularSkillDigest, baseUrl: string): string[] {
  return digest.created.map((item) => {
    const by = item.authorName ? ` · ${item.authorName}` : ''
    // 설명은 둘째 줄로 내린다 — 한 줄에 몰면 이름과 설명이 섞여 안 읽힌다
    const desc = item.summary ? `\n   ${item.summary}` : ''
    return `• ${skillLink(baseUrl, item.id, item.name)}${by}${desc}`
  })
}

/**
 * 업데이트된 스킬 구역.
 *
 * 한 주에 여러 번 고친 스킬은 횟수를 함께 적는다 — 같은 스킬이 목록을 채우지 않게
 * 이미 한 줄로 묶었으므로, 얼마나 손봤는지는 숫자로만 남긴다.
 *
 * @param digest - 집계 결과
 * @param baseUrl - 스킬 상세 링크의 앞부분
 * @returns 사람이 읽는 줄들
 */
export function formatUpdatedLines(digest: PopularSkillDigest, baseUrl: string): string[] {
  return digest.updated.map((item) => {
    const by = item.authorName ? ` · ${item.authorName}` : ''
    const times = (item.bumps ?? 0) > 1 ? ` · ${item.bumps}회` : ''
    // 무엇이 바뀌었는지가 버전 숫자보다 먼저 읽혀야 한다. 요약이 없으면 그 자리를 비운다
    const note = item.changeNote ? ` — ${item.changeNote}` : ''
    const desc = item.summary ? `\n   ${item.summary}` : ''
    return `• ${skillLink(baseUrl, item.id, item.name)} v${item.version}${note}${by}${times}${desc}`
  })
}

/**
 * 설명을 채워 달라고 부탁하는 구역.
 *
 * 만든 사람 이름을 함께 적는다 — 누가 채워야 하는지가 목록의 요점이다.
 *
 * @param digest - 집계 결과
 * @param baseUrl - 스킬 상세 링크의 앞부분
 * @returns 사람이 읽는 줄들
 */
export function formatMissingDescriptionLines(
  digest: PopularSkillDigest,
  baseUrl: string
): string[] {
  const lines = digest.missingDescriptions.map((item) => {
    const by = item.authorName ? ` · ${item.authorName}` : ''
    // 쓰이고 있는데 설명이 없으면 더 급하다는 것을 숫자로 보인다
    const used = item.recentApplies > 0 ? ` · 최근 30일 ${item.recentApplies}회 사용` : ''
    return `• ${skillLink(baseUrl, item.id, item.name)}${by}${used}`
  })
  const hidden = digest.missingDescriptionTotal - digest.missingDescriptions.length
  if (hidden > 0) lines.push(`  …외 ${hidden}개`)
  return lines
}

/**
 * 이번 주에 알릴 것이 하나라도 있는가.
 *
 * 세 구역이 전부 비면 보내지 않는다. 조용한 주에 "0건"을 보내면 그 채널을 아무도 안 읽게 되고,
 * 그러면 진짜 알림도 같이 묻힌다.
 *
 * @param digest - 집계 결과
 * @returns 보낼 내용이 있으면 true
 */
export function hasAnythingToSay(digest: PopularSkillDigest): boolean {
  return digest.top.length > 0 || digest.created.length > 0 || digest.updated.length > 0
}
