import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildPopularSkillsQuery } from '../../../../packages/lib/src/notifications/popular-skills'

// SQL 생성만 한다. 실행·연결·운영 DB 쓰기는 하지 않는다.
beforeAll(() => { vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test') })
afterAll(() => { vi.unstubAllEnvs() })

describe('AITK 관리 스킬 인기 집계 범위', () => {
  it('카탈로그 내부 조인으로 외부·삭제된 스킬 이벤트를 제외한다', () => {
    const query = buildPopularSkillsQuery(new Date('2026-09-03Z'), new Date('2026-09-10Z')).toSQL()
    expect(query.sql).toContain('inner join "catalog_items" on "catalog_items"."id" = "skill_events"."skill_id"')
    expect(query.sql).not.toContain('left join')
  })

  it('apply·skill·발행 상태와 기간 상하한을 SQL에 적용한다', () => {
    const query = buildPopularSkillsQuery(new Date('2026-09-03Z'), new Date('2026-09-10Z')).toSQL()
    expect(query.params).toEqual(expect.arrayContaining(['apply', 'skill', 'published']))
    expect(query.sql).toMatch(/"catalog_items"\."type" = \$/)
    expect(query.sql).toMatch(/"catalog_items"\."status" = \$\d+ or "catalog_items"\."status" is null/)
    expect(query.sql).toMatch(/"skill_events"\."created_at" >= \$/)
    expect(query.sql).toMatch(/"skill_events"\."created_at" < \$/)
  })
})

