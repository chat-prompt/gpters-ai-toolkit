/**
 * Migration script for skill_events exercise action types (DEV-3064)
 *
 * Adds 'exercise_search' and 'exercise_apply' to the skill_event_action enum.
 * Usage: set -a && source .env.local && set +a && node scripts/migrate-skill-events.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { neon } = require('../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.js')

const sql = neon(process.env.DATABASE_URL)

/** ALTER TYPE statements must run outside transactions */
const ALTER_STATEMENTS = [
  "ALTER TYPE skill_event_action ADD VALUE IF NOT EXISTS 'exercise_search'",
  "ALTER TYPE skill_event_action ADD VALUE IF NOT EXISTS 'exercise_apply'",
]

async function run() {
  console.log('=== Skill Events Exercise Migration (DEV-3064) ===\n')

  // Step 1: Add enum values
  console.log('Step 1: Adding enum values...')
  for (const stmt of ALTER_STATEMENTS) {
    await sql.query(stmt)
    const value = stmt.match(/'([^']+)'$/)?.[1]
    console.log('  OK:', value)
  }

  // Step 2: Verify
  const result = await sql.query(`
    SELECT enumlabel
    FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'skill_event_action')
    ORDER BY enumsortorder
  `)
  const rows = Array.isArray(result) ? result : result.rows ?? []
  console.log('\nStep 2: Verification')
  console.log('  All enum values:', rows.map(r => r.enumlabel).join(', '))

  const hasExercise = rows.some(r => r.enumlabel === 'exercise_search')
    && rows.some(r => r.enumlabel === 'exercise_apply')
  console.log('  Exercise values present:', hasExercise ? 'YES' : 'NO')

  console.log('\n=== Migration complete ===')
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
