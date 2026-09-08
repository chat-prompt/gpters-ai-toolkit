import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
const conditions: SQL[] = []
vi.mock('@gpters/db', async original => {
  const actual = await original<typeof import('@gpters/db')>()
  const chain = { from: () => chain, where: (condition: SQL) => { conditions.push(condition); return chain },
    orderBy: () => chain, limit: async () => [] }
  return { ...actual, db: { select: () => chain } }
})
vi.mock('../../../../packages/lib/src/search/embedding', () => ({ generateEmbedding: vi.fn() }))
import { semanticSearch } from '../../../../packages/lib/src/search/vector-search'
beforeEach(() => { conditions.length = 0 })
describe('agent search platform compatibility', () => {
  it.each(['agent', 'cli'])('does not restrict %s to a nonexistent skill platform, including fallback', async clientType => {
    await semanticSearch({ query: 'typescript testing', clientType, queryEmbedding: [0.1, 0.2] })
    expect(conditions).toHaveLength(2)
    for (const condition of conditions) expect(new PgDialect().sqlToQuery(condition).sql).not.toContain('platforms')
  })
  it('preserves platform restrictions for a concrete runtime', async () => {
    await semanticSearch({ query: 'typescript testing', clientType: 'claude-code', queryEmbedding: [0.1, 0.2] })
    expect(conditions).toHaveLength(2)
    for (const condition of conditions) {
      const query = new PgDialect().sqlToQuery(condition)
      expect(query.sql).toContain('platforms')
      expect(query.params).toContain('claude-code')
    }
  })
})
