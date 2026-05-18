/**
 * EvoSkill generation agent
 *
 * Processes pending failure patterns using Gemini Flash to:
 * - zero_result_cluster → generate new skill draft
 * - low_conversion → suggest improvements to existing skill
 * - repeated_skip → suggest description/tag improvements
 *
 * Max 10 patterns per run, input capped at 2000 chars.
 */

import { db, evoFailurePatterns, evoRunLogs, catalogItems } from '@gpters/db'
import { eq, sql } from 'drizzle-orm'
import { GoogleGenAI } from '@google/genai'
import { createLogger } from '../core/logger'
import { deploySkill } from '../mcp/handlers'

const log = createLogger('evo-agent')

const GENERATION_MODEL = 'gemini-2.0-flash'
const BATCH_SIZE = parseInt(process.env.EVOSKILL_BATCH_SIZE || '10', 10)
const INPUT_CHAR_LIMIT = 2000
const MAX_RETRY = parseInt(process.env.EVOSKILL_MAX_RETRY || '3', 10)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerationResult {
  patternId: string
  action: 'skill_created' | 'suggestion_filed' | 'skipped'
  itemId?: string
  error?: string
}

export interface GenerateResult {
  processed: number
  skillsCreated: number
  suggestionsCreated: number
  skipped: number
  errors: number
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  return new GoogleGenAI({ apiKey })
}

/**
 * Generate a skill draft from zero-result query cluster.
 */
async function generateSkillDraft(
  client: GoogleGenAI,
  queries: string,
  occurrences: number
): Promise<{ name: string; description: string; content: string; tags: string[] } | null> {
  const prompt = `You are an expert Claude Code skill author. Users searched for the following query ${occurrences} times but got zero results:

Query: "${queries.slice(0, INPUT_CHAR_LIMIT)}"

Generate a Claude Code skill that would satisfy this search intent. Return ONLY valid JSON:
{
  "name": "skill name in kebab-case (e.g., git-commit-helper)",
  "description": "One-line Korean description of what this skill does",
  "content": "Full skill markdown content in Korean. Include clear instructions, steps, and examples.",
  "tags": ["tag1", "tag2"]
}

Rules:
- Name must be lowercase kebab-case
- Description and content in Korean
- Content should be practical and actionable
- Include 2-4 relevant tags`

  try {
    const response = await client.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
    })

    const text = response.text?.trim()
    if (!text) throw new Error('Gemini returned empty response')

    // Extract JSON from possible markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`No JSON in Gemini response: ${text.slice(0, 200)}`)

    return JSON.parse(jsonMatch[0])
  } catch (err) {
    log.warn('Failed to generate skill draft', { error: (err as Error).message })
    throw err
  }
}


// ---------------------------------------------------------------------------
// Pattern processors
// ---------------------------------------------------------------------------

async function processZeroResultCluster(
  client: GoogleGenAI,
  pattern: { id: string; signalData: Record<string, unknown> }
): Promise<GenerationResult> {
  const query = pattern.signalData.query as string
  const occurrences = (pattern.signalData.occurrences as number) || 3

  const draft = await generateSkillDraft(client, query, occurrences)
  if (!draft) return { patternId: pattern.id, action: 'skipped', error: 'LLM generation failed' }

  const result = await deploySkill({
    type: 'skill',
    name: draft.name,
    description: draft.description,
    content: draft.content,
    tags: draft.tags,
    status: 'draft',
  })

  if (!result.success) {
    return { patternId: pattern.id, action: 'skipped', error: result.error }
  }

  // Mark the new skill as evo-generated
  await db.update(catalogItems).set({
    evoGenerated: true,
    evoPatternId: pattern.id,
  }).where(eq(catalogItems.id, result.id))

  return { patternId: pattern.id, action: 'skill_created', itemId: result.id }
}

async function processLowConversion(
  _client: GoogleGenAI,
  pattern: { id: string; signalData: Record<string, unknown> }
): Promise<GenerationResult> {
  // Suggest feature removed (EDU-7987 D2) — low_conversion patterns are skipped
  return { patternId: pattern.id, action: 'skipped', error: 'suggest feature removed' }
}

async function processRepeatedSkip(
  _client: GoogleGenAI,
  pattern: { id: string; signalData: Record<string, unknown> }
): Promise<GenerationResult> {
  // Suggest feature removed (EDU-7987 D2) — repeated_skip patterns are skipped
  return { patternId: pattern.id, action: 'skipped', error: 'suggest feature removed' }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process pending failure patterns by generating skill drafts
 * or improvement suggestions via LLM.
 */
export async function generateFromPatterns(): Promise<GenerateResult> {
  const startedAt = new Date()
  const result: GenerateResult = {
    processed: 0,
    skillsCreated: 0,
    suggestionsCreated: 0,
    skipped: 0,
    errors: 0,
  }

  const client = getGeminiClient()
  if (!client) {
    log.warn('GEMINI_API_KEY not set, skipping evo-generate')
    return result
  }

  try {
    // Fetch pending patterns that have not exhausted their retry budget,
    // ordered by severity desc then fewest retries first.
    const patterns = await db
      .select()
      .from(evoFailurePatterns)
      .where(sql`${evoFailurePatterns.status} = 'pending' AND ${evoFailurePatterns.retryCount} < ${MAX_RETRY}`)
      .orderBy(sql`
        CASE severity
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        retry_count ASC
      `)
      .limit(BATCH_SIZE)

    if (patterns.length === 0) {
      log.info('No pending patterns to process')
      return result
    }

    for (const pattern of patterns) {
      // Mark as processing
      await db.update(evoFailurePatterns)
        .set({ status: 'processing' })
        .where(eq(evoFailurePatterns.id, pattern.id))

      let genResult: GenerationResult

      try {
        const signalData = pattern.signalData as Record<string, unknown>

        switch (pattern.patternType) {
          case 'zero_result_cluster':
            genResult = await processZeroResultCluster(client, { id: pattern.id, signalData })
            break
          case 'low_conversion':
            genResult = await processLowConversion(client, { id: pattern.id, signalData })
            break
          case 'repeated_skip':
            genResult = await processRepeatedSkip(client, { id: pattern.id, signalData })
            break
          default:
            genResult = { patternId: pattern.id, action: 'skipped', error: `Unknown type: ${pattern.patternType}` }
        }
      } catch (err) {
        genResult = { patternId: pattern.id, action: 'skipped', error: (err as Error).message }
        result.errors++
      }

      // Update pattern status based on result
      if (genResult.action === 'skipped') {
        const nextRetry = (pattern.retryCount ?? 0) + 1
        const exhausted = nextRetry >= MAX_RETRY
        await db.update(evoFailurePatterns)
          .set({
            status: exhausted ? 'failed' : 'pending',
            retryCount: nextRetry,
            lastError: genResult.error ?? 'unknown',
          })
          .where(eq(evoFailurePatterns.id, pattern.id))
        result.skipped++
        if (exhausted) {
          log.warn('Pattern marked failed after max retries', {
            patternId: pattern.id,
            patternType: pattern.patternType,
            error: genResult.error,
          })
        }
      } else {
        await db.update(evoFailurePatterns)
          .set({
            status: 'resolved',
            resolvedAction: genResult.action,
            resolvedItemId: genResult.itemId,
            resolvedAt: new Date(),
          })
          .where(eq(evoFailurePatterns.id, pattern.id))

        if (genResult.action === 'skill_created') result.skillsCreated++
        if (genResult.action === 'suggestion_filed') result.suggestionsCreated++
      }

      result.processed++
    }

    log.info('EvoSkill generation complete', { ...result })
  } catch (err) {
    result.errors++
    log.error('generateFromPatterns failed', err)

    await db.insert(evoRunLogs).values({
      runType: 'generate',
      startedAt,
      completedAt: new Date(),
      stats: result as unknown as Record<string, number>,
      error: (err as Error).message,
    }).catch(() => {})

    throw err
  }

  await db.insert(evoRunLogs).values({
    runType: 'generate',
    startedAt,
    completedAt: new Date(),
    stats: result as unknown as Record<string, number>,
  }).catch((err) => {
    log.warn('Failed to log evo run', { error: (err as Error).message })
  })

  return result
}
