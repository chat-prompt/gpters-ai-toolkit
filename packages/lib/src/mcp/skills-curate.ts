/**
 * Curated skill categories for exercise integration (DEV-3063)
 *
 * Provides predefined skill categories with DB-backed detail lookups.
 * Categories are hardcoded mappings; skill details come from catalog_items.
 */

import { db, catalogItems } from '@gpters/db'
import { inArray } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('skills-curate')

/** Curated category definition with skill IDs */
interface CuratedCategoryDef {
  /** Category description */
  description: string
  /** Skill IDs in this category */
  skills: string[]
}

/** Hardcoded curated categories */
const CURATED_CATEGORIES: Record<string, CuratedCategoryDef> = {
  'project-start': {
    description: '프로젝트 시작 시 추천 워크플로우',
    skills: ['brainstorming', 'writing-plans', 'test-driven-development'],
  },
  'testing': {
    description: '테스트 관련 스킬',
    skills: ['test-driven-development', 'webapp-testing', 'systematic-debugging'],
  },
  'code-quality': {
    description: '코드 품질 향상 스킬',
    skills: ['code-review', 'simplify', 'requesting-code-review'],
  },
  'deployment': {
    description: '배포 및 출시 관련 스킬',
    skills: ['verification-before-completion', 'finishing-a-development-branch'],
  },
}

/** Skill entry in curate response */
export interface CuratedSkillItem {
  /** Skill ID */
  id: string
  /** Display name */
  name: string
  /** Short description */
  description: string
  /** Item type (skill, agent, etc.) */
  type: string
  /** Slash command to invoke (e.g., "/skill-id") */
  command?: string
}

/** Complete curate response */
export interface SkillCurateResponse {
  /** Category key */
  category: string
  /** Category description */
  description: string
  /** Skills in this category */
  skills: CuratedSkillItem[]
  /** Response metadata */
  meta: {
    /** Number of skills found in DB for this category */
    totalInCategory: number
    /** Catalog version (date string) */
    catalogVersion: string
  }
}

/**
 * Get curated skills for a specific category
 *
 * @param category - Category key (e.g., "project-start", "testing")
 * @returns Curated skills with DB-backed details, or null if category not found
 */
export async function getCuratedSkills(
  category: string
): Promise<SkillCurateResponse | null> {
  const categoryDef = CURATED_CATEGORIES[category]
  if (!categoryDef) return null

  const skillIds = categoryDef.skills

  // Fetch skill details from DB
  const items = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      description: catalogItems.description,
      type: catalogItems.type,
    })
    .from(catalogItems)
    .where(inArray(catalogItems.id, skillIds))

  // Build a lookup map for ordering
  const itemMap = new Map(items.map(item => [item.id, item]))

  // Preserve the curated order, skipping IDs not found in DB
  const skills: CuratedSkillItem[] = []
  for (const id of skillIds) {
    const item = itemMap.get(id)
    if (item) {
      skills.push({
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        command: `/${item.id}`,
      })
    }
  }

  log.info('Curated skills fetched', {
    category,
    requested: skillIds.length,
    found: skills.length,
  })

  return {
    category,
    description: categoryDef.description,
    skills,
    meta: {
      totalInCategory: skills.length,
      catalogVersion: new Date().toISOString().slice(0, 10),
    },
  }
}

/**
 * List all available curated category keys
 *
 * @returns Array of category keys
 */
export function listCuratedCategories(): string[] {
  return Object.keys(CURATED_CATEGORIES)
}
