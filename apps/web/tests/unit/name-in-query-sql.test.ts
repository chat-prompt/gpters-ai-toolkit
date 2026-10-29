// @vitest-environment node
/**
 * nameInQuerySql 테스트 (DEV-4697)
 *
 * 검색어에 스킬 ID·이름이 그대로 있는지 보는 SQL 식을 실제 Postgres로 계산해 본다.
 * 테이블은 만들지도 읽지도 않는다. VALUES로 만든 가짜 catalog_items 행에 식만 계산하므로 어느 DB에 붙여도 바뀌는 것이 없다.
 * NAME_SQL_TEST_DATABASE_URL이 없으면 건너뛴다. 예: 로컬 복사본 postgresql://…@127.0.0.1:5433/aitk2
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { nameInQuerySql } from '../../../../packages/lib/src/search/vector-search'

const url = process.env.NAME_SQL_TEST_DATABASE_URL
// postgres 드라이버는 packages/db 의존성이라 그쪽에서 불러온다
const postgres = url ? createRequire(resolve(__dirname, '../../../../packages/db/package.json'))('postgres') : null
const client = url ? postgres(url, { max: 1 }) : null

const ROWS: Array<[string, string]> = [
  ['write-post', '사례글 쓰기'],
  ['md2pdf', 'md2pdf'],
  ['meeting-notes', '회의록 작성'],
  ['report', '보고'],
  ['code-review', 'Receiving Code Review'],
  ['x', 'x'],
]

/** 검색어마다 이름이 맞은 스킬 ID 목록을 돌려준다 */
async function matches(query: string): Promise<string[]> {
  const q = new PgDialect().sqlToQuery(nameInQuerySql(query))
  const values = ROWS.map(([id, name]) => `('${id}', '${name}')`).join(', ')
  const rows = await client!.unsafe(
    `select "catalog_items"."id" as id from (values ${values}) as "catalog_items"("id", "name") where ${q.sql} order by 1`,
    q.params as never[],
  )
  return rows.map((r: { id: string }) => r.id)
}

describe.skipIf(!url)('nameInQuerySql', () => {
  afterAll(() => client?.end())

  it('ID는 조사가 붙어도 단어로 맞춘다', async () => {
    expect(await matches('write-post로 글 써줘')).toEqual(['write-post'])
  })
  it('ID의 일부 단어만 있으면 맞추지 않는다', async () => {
    expect(await matches('post 하나 올려줘')).toEqual([])
  })
  it('띄어쓰기 없는 영문 이름은 단어로 맞춘다', async () => {
    expect(await matches('이 파일 md2pdf로 바꿔줘')).toEqual(['md2pdf'])
    expect(await matches('md2pdfx 써줘')).toEqual([])
  })
  it('한글 이름은 조사가 붙어도 부분 문자열로 맞춘다', async () => {
    expect(await matches('회의록 작성을 부탁해')).toEqual(['meeting-notes'])
  })
  it('3글자 미만 한글 이름은 부분 문자열로 맞추지 않는다', async () => {
    expect(await matches('보고서 써줘')).toEqual([])
  })
  it('띄어쓰기 있는 영문 이름은 대소문자 없이 부분 문자열로 맞춘다', async () => {
    expect(await matches('receiving code review 해줘')).toEqual(['code-review'])
  })
  it('1글자 이름과 ID는 맞추지 않는다', async () => {
    expect(await matches('x 해줘')).toEqual([])
  })
})
