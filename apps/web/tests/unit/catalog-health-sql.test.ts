/**
 * 카탈로그 위생 집계의 상관 서브쿼리가 **테이블을 한정하는지** 검증한다.
 *
 * drizzle은 조인이 없는 `select`에서 컬럼을 접두 없이 렌더한다. 그 조각을 서브쿼리 안에 넣으면
 * `"id"`가 바깥 `catalog_items.id`가 아니라 `skill_events.id`로 해석되고, 조건이
 * `skill_events.skill_id = skill_events.id`가 되어 절대 참이 되지 않는다.
 *
 * **오류가 나지 않는다.** 모든 스킬이 조용히 "로드 0건"으로 나온다. 2026-09-07에 운영에서
 * 466개 전부 로드 0으로 집계되는 것을 보고 발견했다 — 실제 값은 279다.
 *
 * 숫자는 DB가 있어야 확인되지만, **한정 여부는 생성된 SQL만 봐도 잡을 수 있다.**
 */

import { beforeAll, describe, expect, it } from 'vitest'

// 질의를 만들기만 하고 실행하지 않는다. drizzle은 `toSQL()`에서 접속하지 않으므로
// 형식만 맞는 주소면 된다 — 이 테스트는 DB 없이 돈다.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

describe('카탈로그 위생 집계 SQL', () => {
  let built: { sql: string }

  beforeAll(async () => {
    const { buildCatalogHealthQuery } = await import(
      '../../../../packages/lib/src/features/ax/catalog-health'
    )
    built = buildCatalogHealthQuery('skill').toSQL()
  })

  it('서브쿼리의 바깥 참조가 catalog_items로 한정된다', () => {
    expect(built.sql).toContain('"catalog_items"."id"')
  })

  it('서브쿼리의 이벤트 컬럼도 skill_events로 한정된다', () => {
    expect(built.sql).toContain('"skill_events"."skill_id"')
    expect(built.sql).toContain('"skill_events"."action"')
  })

  it('한정되지 않은 `"skill_id" = "id"` 비교가 남아 있지 않다', () => {
    // 이 모양이 바로 조용히 0을 내던 조건이다
    expect(built.sql.replace(/\s+/g, ' ')).not.toContain('"skill_id" = "id"')
  })

  it('바깥 질의는 여전히 catalog_items에서 읽는다', () => {
    expect(built.sql).toContain('from "catalog_items"')
  })
})
