import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

function getDatabaseUrl(): string | null {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
  const databaseUrl = isTestEnv
    ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL

  return databaseUrl || null
}

let _sql: NeonQueryFunction<false, false> | null = null
let _db: NeonHttpDatabase<typeof schema> | null = null
let _initialized = false

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_initialized) {
    const url = getDatabaseUrl()
    if (!url) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    _sql = neon(url)
    _db = drizzle(_sql, { schema })
    _initialized = true
  }
  return _db!
}

export const db: NeonHttpDatabase<typeof schema> = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop)
  },
})

export function isDatabaseAvailable(): boolean {
  return !!getDatabaseUrl()
}

export * from './schema'
