import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { Sql } from 'postgres'
import * as schema from './schema'

type PostgresFactory = typeof import('postgres')
type PostgresDrizzleFactory = typeof import('drizzle-orm/postgres-js').drizzle

/**
 * Load the optional standard PostgreSQL client only in the Node.js process that
 * actually selects the local driver. A static import would make Next trace the
 * Node-only package into its browser and Edge graphs even though production
 * continues to use Neon HTTP.
 */
function loadLocalPostgresDriver(): {
  postgres: PostgresFactory
  drizzlePostgres: PostgresDrizzleFactory
} {
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (name: string) => unknown
    }
  ).getBuiltinModule
  if (!getBuiltinModule) {
    throw new Error('DATABASE_DRIVER=postgres-js requires a Node.js runtime')
  }

  const moduleApi = getBuiltinModule('module') as {
    createRequire: (filename: string | URL) => (specifier: string) => unknown
  }
  const requireFromHere = moduleApi.createRequire(import.meta.url)
  const postgresPackage = ['post', 'gres'].join('')
  const drizzlePackage = ['drizzle-orm', 'postgres-js'].join('/')
  const loadedPostgres = requireFromHere(postgresPackage) as
    | { default?: PostgresFactory }
    | PostgresFactory
  const loadedDrizzle = requireFromHere(drizzlePackage) as {
    drizzle: PostgresDrizzleFactory
  }
  return {
    postgres: (typeof loadedPostgres === 'function'
      ? loadedPostgres
      : loadedPostgres.default) as PostgresFactory,
    drizzlePostgres: loadedDrizzle.drizzle,
  }
}

function getDatabaseUrl(): string | null {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
  const databaseUrl = isTestEnv
    ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL

  return databaseUrl || null
}

let _sql: NeonQueryFunction<false, false> | null = null
let _postgresSql: Sql | null = null
let _db: NeonHttpDatabase<typeof schema> | null = null
let _initialized = false

function getDatabaseDriver(): 'neon-http' | 'postgres-js' {
  const driver = process.env.DATABASE_DRIVER || 'neon-http'
  if (driver !== 'neon-http' && driver !== 'postgres-js') {
    throw new Error(`Unsupported DATABASE_DRIVER: ${driver}`)
  }
  return driver
}

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_initialized) {
    const url = getDatabaseUrl()
    if (!url) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    if (getDatabaseDriver() === 'postgres-js') {
      const { postgres, drizzlePostgres } = loadLocalPostgresDriver()
      _postgresSql = postgres(url, { max: 5 })
      // Both Drizzle PostgreSQL drivers expose the query-builder surface used by
      // this package. Keep the public type stable so production callers do not
      // inherit a driver union solely for the isolated local environment.
      _db = drizzlePostgres(_postgresSql, { schema }) as unknown as NeonHttpDatabase<typeof schema>
    } else {
      _sql = neon(url)
      _db = drizzle(_sql, { schema })
    }
    _initialized = true
  }
  return _db!
}

export const db: NeonHttpDatabase<typeof schema> = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    const database = getDb()
    const value = Reflect.get(database, prop)

    if (prop === 'execute' && getDatabaseDriver() === 'postgres-js') {
      return async (...args: unknown[]) => {
        const result = await (value as (...executeArgs: unknown[]) => Promise<unknown>).apply(
          database,
          args
        )
        if (!Array.isArray(result)) return result

        const metadata = result as unknown as { count?: number; command?: string }
        return {
          rows: [...result],
          rowCount: metadata.count ?? result.length,
          command: metadata.command,
        }
      }
    }

    return typeof value === 'function' ? value.bind(database) : value
  },
})

export function isDatabaseAvailable(): boolean {
  return !!getDatabaseUrl()
}

/** Close the standard PostgreSQL pool used by one-off local scripts. */
export async function closeDatabase(): Promise<void> {
  if (_postgresSql) {
    await _postgresSql.end({ timeout: 5 })
  }
  _postgresSql = null
  _sql = null
  _db = null
  _initialized = false
}

export * from './schema'
