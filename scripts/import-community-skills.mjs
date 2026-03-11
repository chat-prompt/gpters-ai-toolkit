/**
 * Import community skills from GitHub repos (DEV-3066)
 *
 * Fetches SKILL.md files from official repos, parses frontmatter,
 * upserts into catalog_items, and generates embeddings.
 *
 * Usage: set -a && source .env.local && set +a && node scripts/import-community-skills.mjs
 *
 * Env vars required:
 *   DATABASE_URL — Neon PostgreSQL connection string
 *   OPENAI_API_KEY — For embedding generation
 *   GH_TOKEN (optional) — For higher GitHub API rate limits
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { neon } = require('../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.js')

const sql = neon(process.env.DATABASE_URL)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const GH_TOKEN = process.env.GH_TOKEN || ''

const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIMENSIONS = 3072

/** Source repos to import from */
const SOURCES = [
  {
    repo: 'anthropics/skills',
    path: 'skills',
    defaultAuthor: 'Anthropic',
    defaultTags: ['anthropic', 'official'],
  },
  {
    repo: 'vercel-labs/agent-skills',
    path: 'skills',
    defaultAuthor: 'Vercel',
    defaultTags: ['vercel', 'official'],
  },
]

/** Skills to skip (e.g., zip files, duplicates) */
const SKIP_LIST = new Set([
  'deploy-to-vercel.zip',
  'web-design-guidelines.zip',
])

// ─── GitHub API helpers ──────────────────────────────────────────

function ghHeaders() {
  const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'gpters-skill-importer' }
  if (GH_TOKEN) headers['Authorization'] = `Bearer ${GH_TOKEN}`
  return headers
}

async function ghFetch(url) {
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`)
  return res.json()
}

async function listSkillDirs(repo, path) {
  const entries = await ghFetch(`https://api.github.com/repos/${repo}/contents/${path}`)
  return entries
    .filter(e => e.type === 'dir' && !SKIP_LIST.has(e.name))
    .map(e => e.name)
}

async function fetchFileContent(repo, filePath) {
  try {
    const data = await ghFetch(`https://api.github.com/repos/${repo}/contents/${filePath}`)
    return Buffer.from(data.content, 'base64').toString('utf-8')
  } catch {
    return null
  }
}

async function getLatestCommitSha(repo) {
  const commits = await ghFetch(`https://api.github.com/repos/${repo}/commits?per_page=1`)
  return commits[0]?.sha || null
}

// ─── Frontmatter parser ─────────────────────────────────────────

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: markdown }

  const meta = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    meta[key] = value
  }

  // Handle nested metadata (e.g., metadata.version in Vercel format)
  if (match[1].includes('metadata:')) {
    const metaSection = match[1].match(/metadata:\n((?:\s{2,}.+\n?)*)/)?.[1]
    if (metaSection) {
      for (const line of metaSection.split('\n')) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.slice(0, colonIdx).trim()
        let value = line.slice(colonIdx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        meta[`metadata_${key}`] = value
      }
    }
  }

  return { meta, body: match[2].trim() }
}

// ─── Embedding generation ────────────────────────────────────────

async function generateEmbedding(text) {
  const input = text.replace(/\n/g, ' ').trim().slice(0, 28000)
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMENSIONS }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}

function prepareTextForEmbedding(item) {
  const parts = [item.name, item.description, item.tags?.join(' ') || '', item.content || '']
  return parts.filter(Boolean).join('\n\n').trim()
}

// ─── Main import logic ──────────────────────────────────────────

async function importSkill(source, skillName, commitSha) {
  const skillPath = `${source.path}/${skillName}/SKILL.md`
  const content = await fetchFileContent(source.repo, skillPath)
  if (!content) {
    console.log(`  SKIP: ${skillName} — no SKILL.md found`)
    return null
  }

  const { meta, body } = parseFrontmatter(content)
  const name = meta.name || skillName
  const description = meta.description || body.slice(0, 200)
  const version = meta.metadata_version || meta.version || '1.0.0'
  const id = `community-${skillName}`

  // Determine tags
  const tags = [...source.defaultTags]
  if (meta.metadata_author) tags.push(meta.metadata_author.toLowerCase())
  if (skillName.includes('react')) tags.push('react')
  if (skillName.includes('next')) tags.push('next.js')

  // Check if already exists with same commit SHA
  const existing = await sql`
    SELECT source_commit_sha FROM catalog_items WHERE id = ${id}
  `
  if (existing.length > 0 && existing[0].source_commit_sha === commitSha) {
    console.log(`  SKIP: ${id} — already up to date (${commitSha.slice(0, 7)})`)
    return 'skipped'
  }

  // Generate embedding
  const embeddingText = prepareTextForEmbedding({ name, description, tags, content: body })
  const embedding = await generateEmbedding(embeddingText)
  const embeddingStr = `[${embedding.join(',')}]`

  // Upsert into catalog_items
  await sql`
    INSERT INTO catalog_items (
      id, type, name, description, content, tags, version, status,
      embedding, source_repo, source_commit_sha, updated_at
    ) VALUES (
      ${id}, 'skill', ${name}, ${description}, ${body}, ${tags},
      ${version}, 'published',
      ${embeddingStr}::halfvec(3072), ${source.repo}, ${commitSha}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      content = EXCLUDED.content,
      tags = EXCLUDED.tags,
      version = EXCLUDED.version,
      embedding = EXCLUDED.embedding,
      source_repo = EXCLUDED.source_repo,
      source_commit_sha = EXCLUDED.source_commit_sha,
      updated_at = NOW()
  `

  const action = existing.length > 0 ? 'UPDATED' : 'CREATED'
  console.log(`  ${action}: ${id} — "${name}" (${source.repo})`)
  return action.toLowerCase()
}

async function run() {
  console.log('=== Community Skills Import (DEV-3066) ===\n')

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set')
    process.exit(1)
  }
  if (!OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not set')
    process.exit(1)
  }

  // Ensure source tracking columns exist
  console.log('Step 0: Ensuring source tracking columns...')
  await sql.query(`ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "source_repo" text`)
  await sql.query(`ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "source_commit_sha" text`)
  console.log('  OK\n')

  const stats = { created: 0, updated: 0, skipped: 0, errors: 0 }

  for (const source of SOURCES) {
    console.log(`\n── ${source.repo} ──────────────────────`)

    let commitSha
    try {
      commitSha = await getLatestCommitSha(source.repo)
      console.log(`Latest commit: ${commitSha?.slice(0, 7)}`)
    } catch (err) {
      console.error(`  ERROR fetching commit SHA: ${err.message}`)
      stats.errors++
      continue
    }

    let skillDirs
    try {
      skillDirs = await listSkillDirs(source.repo, source.path)
      console.log(`Found ${skillDirs.length} skills: ${skillDirs.join(', ')}\n`)
    } catch (err) {
      console.error(`  ERROR listing skills: ${err.message}`)
      stats.errors++
      continue
    }

    for (const skillName of skillDirs) {
      try {
        const result = await importSkill(source, skillName, commitSha)
        if (result === 'created') stats.created++
        else if (result === 'updated') stats.updated++
        else if (result === 'skipped') stats.skipped++
      } catch (err) {
        console.error(`  ERROR: ${skillName} — ${err.message}`)
        stats.errors++
      }

      // Rate limit: small delay between skills to avoid GitHub API limits
      await new Promise(r => setTimeout(r, 200))
    }
  }

  // Verification
  console.log('\n── Verification ──────────────────────────')
  const imported = await sql`
    SELECT id, name, source_repo, source_commit_sha
    FROM catalog_items
    WHERE source_repo IS NOT NULL
    ORDER BY source_repo, id
  `
  console.log(`Total imported skills: ${imported.length}`)
  for (const item of imported) {
    console.log(`  ${item.id} — "${item.name}" (${item.source_repo}, ${item.source_commit_sha?.slice(0, 7)})`)
  }

  console.log(`\n=== Import complete ===`)
  console.log(`Created: ${stats.created}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`)
}

run().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
