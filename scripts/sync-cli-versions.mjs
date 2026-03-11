/**
 * CLI tool version sync via Context7 API (DEV-3067)
 *
 * Checks latest versions of CLI tools that have context7_library_id
 * and updates cli_tools.latest_version when stale.
 *
 * Usage: set -a && source .env.local && set +a && node scripts/sync-cli-versions.mjs
 * Cron: Run daily (e.g., via GitHub Actions)
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { neon } = require('../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.js')

const sql = neon(process.env.DATABASE_URL)

async function fetchLatestVersion(libraryId) {
  try {
    const url = `https://context7.com/api/v2/libs/search?libraryName=${encodeURIComponent(libraryId)}`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return null

    const data = await res.json()
    const match = data.results.find(r => r.id === libraryId)
    if (!match || match.versions.length === 0) return null

    // Filter to valid semver-like versions (e.g., "7.0.0", "v6.1.0")
    const validVersion = match.versions.find(v => /^v?\d+\.\d+/.test(v))
    if (!validVersion) return null
    return validVersion.replace(/^v/, '')
  } catch {
    return null
  }
}

function isNewerVersion(current, latest) {
  const parse = (v) => v.replace(/^v/, '').split('.').map(Number)
  const c = parse(current)
  const l = parse(latest)
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0
    const lv = l[i] || 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}

async function run() {
  console.log('=== CLI Tool Version Sync (DEV-3067) ===\n')

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set')
    process.exit(1)
  }

  const tools = await sql`
    SELECT id, name, latest_version, context7_library_id
    FROM cli_tools
    WHERE context7_library_id IS NOT NULL
    ORDER BY id
  `

  console.log(`Found ${tools.length} tools with Context7 library IDs\n`)

  let updated = 0
  let stale = 0
  let errors = 0

  for (const tool of tools) {
    process.stdout.write(`  ${tool.id} (${tool.name}): ${tool.latest_version || '?'} → `)

    try {
      const latest = await fetchLatestVersion(tool.context7_library_id)

      if (!latest) {
        console.log('no version found')
      } else if (!tool.latest_version) {
        console.log(`${latest} (NEW)`)
        await sql`UPDATE cli_tools SET latest_version = ${latest}, updated_at = NOW() WHERE id = ${tool.id}`
        updated++
      } else if (isNewerVersion(tool.latest_version, latest)) {
        console.log(`${latest} (STALE → updated)`)
        await sql`UPDATE cli_tools SET latest_version = ${latest}, updated_at = NOW() WHERE id = ${tool.id}`
        updated++
        stale++
      } else {
        console.log(`${latest} (current)`)
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      errors++
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n=== Sync complete ===`)
  console.log(`Checked: ${tools.length}, Updated: ${updated}, Stale: ${stale}, Errors: ${errors}`)
}

run().catch(err => {
  console.error('Sync failed:', err)
  process.exit(1)
})
