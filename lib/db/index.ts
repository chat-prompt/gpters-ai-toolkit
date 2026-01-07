/**
 * Database connection module
 *
 * Configures and exports the Drizzle ORM instance connected to
 * Neon PostgreSQL serverless database with test environment support.
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Use TEST_DATABASE_URL in test environment to isolate test data
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
const databaseUrl = isTestEnv
  ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const sql = neon(databaseUrl)

export const db = drizzle(sql, { schema })

export * from './schema'
