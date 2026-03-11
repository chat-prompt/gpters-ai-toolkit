/**
 * Vercel Cron endpoint for importing community skills from GitHub
 *
 * Runs weekly on Sundays at 05:00 UTC. Fetches SKILL.md files from
 * anthropics/skills and vercel-labs/agent-skills, parses frontmatter,
 * and upserts into catalog_items with embeddings.
 *
 * DEV-3073
 */

import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@gpters/lib/core'
import { parseRawFrontmatter } from '@gpters/lib/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const log = createLogger('cron:import-community-skills')

/** GitHub SKILL.md source definition */
interface SkillSource {
  owner: string
  repo: string
  branch: string
  skillsDir: string
}

const SOURCES: SkillSource[] = [
  { owner: 'anthropics', repo: 'skills', branch: 'main', skillsDir: '' },
  { owner: 'vercel-labs', repo: 'agent-skills', branch: 'main', skillsDir: '' },
]

const SKIP_LIST = new Set([
  'deploy-to-vercel.zip',
  'web-design-guidelines.zip',
])

/**
 * Fetch directory listing from GitHub API
 */
async function listGitHubDir(source: SkillSource): Promise<Array<{ name: string; path: string; sha: string }>> {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.skillsDir}`
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' }
  if (process.env.GH_TOKEN) headers['Authorization'] = `token ${process.env.GH_TOKEN}`

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${source.owner}/${source.repo}`)

  const items = await res.json() as Array<{ name: string; path: string; type: string; sha: string }>
  return items.filter(i => i.type === 'dir').map(i => ({ name: i.name, path: i.path, sha: i.sha }))
}

/**
 * Fetch SKILL.md content from GitHub
 */
async function fetchSkillMd(source: SkillSource, skillPath: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${skillPath}/SKILL.md`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null
  return res.text()
}

/**
 * Fetch commit SHA for a specific file
 */
async function fetchCommitSha(source: SkillSource, skillPath: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/commits?path=${skillPath}/SKILL.md&per_page=1`
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' }
  if (process.env.GH_TOKEN) headers['Authorization'] = `token ${process.env.GH_TOKEN}`

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null

  const commits = await res.json() as Array<{ sha: string }>
  return commits[0]?.sha ?? null
}

/**
 * GET handler for community skills import cron job
 *
 * Validates CRON_SECRET, then imports skills from GitHub sources.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Lazy import to avoid loading DB/OpenAI at module level
  const { db, catalogItems } = await import('@gpters/db')
  const { eq } = await import('drizzle-orm')

  const stats = { checked: 0, created: 0, updated: 0, skipped: 0, errors: 0 }

  try {
    for (const source of SOURCES) {
      const sourceRepo = `${source.owner}/${source.repo}`
      log.info('Processing source', { sourceRepo })

      let skills: Array<{ name: string; path: string; sha: string }>
      try {
        skills = await listGitHubDir(source)
      } catch (err) {
        log.error('Failed to list source', { sourceRepo, error: (err as Error).message })
        stats.errors++
        continue
      }

      for (const skill of skills) {
        if (SKIP_LIST.has(skill.name)) continue
        stats.checked++

        try {
          const id = `community-${skill.name}`
          const commitSha = await fetchCommitSha(source, skill.path)

          // Check if already up-to-date
          const existing = await db
            .select({ id: catalogItems.id, sourceCommitSha: catalogItems.sourceCommitSha })
            .from(catalogItems)
            .where(eq(catalogItems.id, id))
            .limit(1)

          if (existing[0]?.sourceCommitSha === commitSha) {
            stats.skipped++
            continue
          }

          // Fetch SKILL.md content
          const content = await fetchSkillMd(source, skill.path)
          if (!content) {
            stats.errors++
            continue
          }

          const { meta, body } = parseRawFrontmatter(content)
          const skillName = meta.name || skill.name
          const description = meta.description || `Community skill: ${skillName}`

          // Generate embedding
          let embedding: number[] | null = null
          if (process.env.OPENAI_API_KEY) {
            try {
              const embRes = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'text-embedding-3-large',
                  input: `${skillName}: ${description}\n\n${body.slice(0, 2000)}`,
                  dimensions: 3072,
                }),
                signal: AbortSignal.timeout(15000),
              })
              if (embRes.ok) {
                const embData = await embRes.json() as { data: Array<{ embedding: number[] }> }
                embedding = embData.data[0]?.embedding ?? null
              }
            } catch {
              log.warn('Embedding generation failed', { id })
            }
          }

          // Upsert catalog item
          const values = {
            id,
            name: skillName,
            description,
            content: body,
            type: 'skill' as const,
            status: 'published' as const,
            sourceRepo,
            sourceCommitSha: commitSha,
            ...(embedding ? { embedding } : {}),
            updatedAt: new Date(),
          }

          if (existing[0]) {
            await db.update(catalogItems).set(values).where(eq(catalogItems.id, id))
            stats.updated++
          } else {
            await db.insert(catalogItems).values({ ...values, createdAt: new Date() })
            stats.created++
          }

          // Rate limit: 200ms between GitHub API calls
          await new Promise(r => setTimeout(r, 200))
        } catch (err) {
          stats.errors++
          log.error('Failed to import skill', { skill: skill.name, error: (err as Error).message })
        }
      }
    }

    log.info('Community skills import completed', stats)

    return NextResponse.json({
      success: true,
      ...stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('Import failed', { error: message })
    return NextResponse.json(
      { success: false, error: message, ...stats },
      { status: 500 }
    )
  }
}
