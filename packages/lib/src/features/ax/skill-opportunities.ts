/**
 * AX Dashboard — 스킬 개선 기회 패널
 *
 * 다른 패널이 "무엇이 일어났는가"를 보여준다면 이 패널은 "무엇을 고칠 수 있는가"를 보여준다.
 * 스킬마다 노출·로드·적용·건너뜀을 견줘 네 갈래로 나누고, 분류마다 근거 수치를 함께 내려보낸다.
 *
 * 종합 점수 하나로 순위를 매기지 않는다. 표본이 작아 점수는 오해를 부르기 쉽고, 분류마다 취할 조치가
 * 다르기 때문이다(이름을 고칠 것인가, 내용을 고칠 것인가, 알릴 것인가, 계측을 고칠 것인가).
 *
 * 검색 노출은 프롬프트 훅이 자동으로 돌린 검색까지 포함한다. 사람이 눈으로 본 횟수가 아니므로
 * 화면에서 참고치로 다뤄야 한다.
 */

import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelOk, panelError } from './panel'
import type {
  AxPanel,
  AxPanelMeta,
  AxSkillOpportunitiesData,
  AxSkillOpportunityCategory,
  AxSkillOpportunityGroup,
  AxSkillOpportunityRow,
} from './types'

const log = createLogger('ax-skill-opportunities')

/**
 * 분류 기준.
 *
 * 표본 하한은 운영 분포를 보고 잡았다(30일 기준 스킬 459개 중 노출 30건 이상 58개, 로드 5건 이상 33개,
 * 적용 3건 이상 14개). 더 낮추면 목록이 수백 줄로 늘어 판단에 쓸 수 없고, 더 올리면 후보가 거의 남지 않는다.
 * 값은 화면에도 그대로 적어 어떤 기준으로 걸렀는지 보이게 한다.
 */
const MIN_SHOWN = 30
const MIN_LOADED = 5
const MIN_APPLIED = 3
/** 노출 대비 로드가 이 비율 미만이면 "고를 만하게 보이지 않는다"로 본다 */
const LOAD_RATE = 0.1
/** 로드 대비 적용이 이 비율 미만이면 "열어 봤지만 쓰지 못했다"로 본다 */
const APPLY_RATE = 1 / 3
/** 분류마다 화면에 내려보내는 최대 줄 수 */
const GROUP_LIMIT = 10

const meta: AxPanelMeta = {
  id: 'skill-opportunities',
  title: '개선 기회',
  description: '스킬마다 노출·로드·적용을 견줘 지금 손볼 후보를 분류합니다',
  source: 'aitk DB (skill_events · mcp_audit_logs · catalog_items)',
  visibility: 'org',
  parentId: 'skill-usage',
  usesPeriod: true,
}

/** 분류 순서 — 화면 표시 순서와 같다 */
const CATEGORY_ORDER: AxSkillOpportunityCategory[] = ['low_load', 'low_apply', 'no_outcome', 'single_user']

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toRow(row: Record<string, unknown>): AxSkillOpportunityRow {
  return {
    skillId: String(row.skill_id ?? ''),
    name: (typeof row.name === 'string' && row.name.trim().length > 0)
      ? row.name
      : String(row.skill_id ?? '이름 없음'),
    shown: num(row.shown),
    loaded: num(row.loaded),
    applied: num(row.applied),
    skipped: num(row.skipped),
    appliers: num(row.appliers),
  }
}

/**
 * 스킬 개선 기회 패널
 *
 * 카탈로그에 있는 스킬만 센다. 삭제됐거나 외부 도구의 식별자로 남은 이벤트는 가시성을 판정할 수 없다.
 */
export const skillOpportunitiesPanel: AxPanel<AxSkillOpportunitiesData> = {
  meta,
  async load({ days }) {
    const since = new Date(Date.now() - days * 86_400_000)

    try {
      const [statsResult, searchResult] = await Promise.all([
        db.execute(sql`
          SELECT e.skill_id,
            c.name AS name,
            count(*) FILTER (WHERE e.action = 'search')::int AS shown,
            count(*) FILTER (WHERE e.action = 'load')::int AS loaded,
            count(*) FILTER (WHERE e.action = 'apply')::int AS applied,
            count(*) FILTER (WHERE e.action = 'skip')::int AS skipped,
            count(DISTINCT e.user_id) FILTER (WHERE e.action = 'apply')::int AS appliers
          FROM skill_events e
          INNER JOIN catalog_items c ON c.id = e.skill_id
          WHERE e.created_at >= ${since}
          GROUP BY e.skill_id, c.name
        `),
        db.execute(sql`
          SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM skill_events e
              WHERE e.source_audit_log_id = a.id AND e.action = 'search'
            ))::int AS zero_result
          FROM mcp_audit_logs a
          WHERE a.tool IN ('search_plugins', 'semantic_search')
            AND a.response_status = 'success'
            AND a.created_at >= ${since}
        `),
      ])

      const rows = ((statsResult as { rows?: Record<string, unknown>[] } | null)?.rows ?? []).map(toRow)
      const searchRow = ((searchResult as { rows?: Record<string, unknown>[] } | null)?.rows ?? [])[0] ?? {}

      const matches: Record<AxSkillOpportunityCategory, AxSkillOpportunityRow[]> = {
        low_load: [],
        low_apply: [],
        single_user: [],
        no_outcome: [],
      }

      for (const row of rows) {
        if (row.shown >= MIN_SHOWN && row.loaded < row.shown * LOAD_RATE) matches.low_load.push(row)
        if (row.loaded >= MIN_LOADED && row.applied < row.loaded * APPLY_RATE) matches.low_apply.push(row)
        if (row.applied >= MIN_APPLIED && row.appliers === 1) matches.single_user.push(row)
        // 결과를 아예 안 남긴 로드만 센다. 건너뜀도 결과 보고이므로 여기서 빠진다.
        if (row.loaded >= MIN_LOADED && row.applied === 0 && row.skipped === 0) matches.no_outcome.push(row)
      }

      /** 분류마다 "고치면 효과가 큰 순"으로 정렬한다 */
      const sortKey = (category: AxSkillOpportunityCategory, row: AxSkillOpportunityRow): number => {
        if (category === 'low_load') return row.shown
        if (category === 'single_user') return row.applied
        return row.loaded
      }

      const groups: AxSkillOpportunityGroup[] = CATEGORY_ORDER.map((category) => {
        const all = matches[category]
        return {
          category,
          total: all.length,
          skills: [...all]
            .sort((a, b) => sortKey(category, b) - sortKey(category, a) || a.name.localeCompare(b.name))
            .slice(0, GROUP_LIMIT),
        }
      })

      const data: AxSkillOpportunitiesData = {
        groups,
        searchRequests: num(searchRow.total),
        zeroResultSearches: num(searchRow.zero_result),
        thresholds: {
          minShown: MIN_SHOWN,
          minLoaded: MIN_LOADED,
          minApplied: MIN_APPLIED,
          loadRate: LOAD_RATE,
          applyRate: APPLY_RATE,
        },
      }

      const totalCandidates = groups.reduce((sum, group) => sum + group.total, 0)
      return panelOk(meta, data, [
        { label: '개선 후보 스킬', value: String(totalCandidates), hint: '건', periodLinked: true },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Skill opportunities panel failed', { message })
      return panelError(meta, '스킬 개선 기회를 계산하지 못했습니다')
    }
  },
}
