/**
 * Register claude-code-infrastructure items and package
 * Run with: npx tsx scripts/add-claude-code-infrastructure-items.ts
 */

import 'dotenv/config'
import { db } from '../lib/db'
import { catalogItems, packageItems, catalogItemTags } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import * as fs from 'fs'
import * as path from 'path'

const PLUGIN_BASE = 'plugins/claude-code-infrastructure'

async function readFile(relativePath: string): Promise<string> {
  const fullPath = path.join(process.cwd(), PLUGIN_BASE, relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

async function main() {
  console.log('🚀 Starting claude-code-infrastructure items registration...\n')

  // Read content files
  const devDocsContent = await readFile('skills/dev-docs-pattern/SKILL.md')
  const hooksGuideContent = await readFile('skills/hooks-guide/SKILL.md')
  const skillActivationContent = await readFile('skills/skill-activation/SKILL.md')
  const packageReadme = await readFile('README.md')

  // Define items (using existing tags from DB)
  // Available tags: writing, documentation, toolkit, productivity, collaboration, code, review,
  // meeting, analysis, database, sql, debugging, learning, refactoring, api, testing, git,
  // setup, deployment, infrastructure, beginner, image, cdn, domain, auth
  const items = [
    {
      id: 'dev-docs-pattern',
      name: 'Dev Docs Pattern',
      description: 'Context 리셋 시 맥락을 유지하기 위한 3-파일 구조 패턴. 6개월간 검증된 실전 패턴입니다.',
      type: 'skill' as const,
      content: devDocsContent,
      author: 'primadonna',
      version: '1.0.0',
      difficulty: 'medium' as const,
      tags: ['productivity', 'documentation'],
      status: 'published' as const,
    },
    {
      id: 'hooks-guide',
      name: 'Claude Code Hooks Guide',
      description: 'Claude Code의 Hooks 시스템을 활용한 자동화 패턴 가이드. Build 체크, 파일 추적, 리마인더 등을 자동화할 수 있습니다.',
      type: 'guide' as const,
      content: hooksGuideContent,
      author: 'primadonna',
      version: '1.0.0',
      difficulty: 'easy' as const,
      tags: ['toolkit', 'setup'],
      status: 'published' as const,
    },
    {
      id: 'skill-activation',
      name: 'Skills Auto-Activation',
      description: 'Skills를 자동으로 활성화하는 패턴. 매번 수동으로 skill을 참조할 필요 없이 자동으로 관련 skill을 제안받을 수 있습니다.',
      type: 'skill' as const,
      content: skillActivationContent,
      author: 'primadonna',
      version: '1.0.0',
      difficulty: 'medium' as const,
      tags: ['productivity', 'toolkit'],
      status: 'published' as const,
    },
  ]

  const packageData = {
    id: 'claude-code-infrastructure',
    name: 'Claude Code Infrastructure',
    description: 'Dev Docs, Hooks, Skills Auto-Activation 패턴을 포함한 Claude Code 인프라 패키지. 6개월간 검증된 실전 패턴들의 모음입니다.',
    type: 'package' as const,
    content: packageReadme,
    author: 'primadonna',
    version: '1.0.0',
    difficulty: 'medium' as const,
    tags: ['infrastructure', 'productivity', 'toolkit'],
    status: 'published' as const,
  }

  // Delete existing items if any
  console.log('🗑️  Cleaning up existing items...')
  const allIds = [...items.map(i => i.id), packageData.id]
  for (const id of allIds) {
    try {
      // Delete package_items first (for package)
      await db.delete(packageItems).where(eq(packageItems.packageId, id))
      await db.delete(packageItems).where(eq(packageItems.itemId, id))
      // Delete catalog_item_tags
      await db.delete(catalogItemTags).where(eq(catalogItemTags.itemId, id))
      // Delete catalog_item
      await db.delete(catalogItems).where(eq(catalogItems.id, id))
    } catch (e) {
      // Ignore errors
    }
  }
  console.log('✅ Cleanup complete\n')

  // Insert individual items
  console.log('📦 Inserting individual items...')
  for (const item of items) {
    const { tags, ...itemData } = item
    await db.insert(catalogItems).values({
      ...itemData,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log(`  ✅ ${item.id} (${item.type})`)

    // Insert tags
    for (const tag of tags) {
      await db.insert(catalogItemTags).values({
        itemId: item.id,
        tagId: tag,
      }).onConflictDoNothing()
    }
  }
  console.log('')

  // Insert package
  console.log('📦 Inserting package...')
  const { tags: packageTags, ...packageItemData } = packageData
  await db.insert(catalogItems).values({
    ...packageItemData,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  console.log(`  ✅ ${packageData.id} (package)`)

  // Insert package tags
  for (const tag of packageTags) {
    await db.insert(catalogItemTags).values({
      itemId: packageData.id,
      tagId: tag,
    }).onConflictDoNothing()
  }
  console.log('')

  // Link items to package
  console.log('🔗 Linking items to package...')
  for (let i = 0; i < items.length; i++) {
    await db.insert(packageItems).values({
      packageId: packageData.id,
      itemId: items[i].id,
      displayOrder: i,
    })
    console.log(`  ✅ ${packageData.id} → ${items[i].id}`)
  }
  console.log('')

  console.log('🎉 Registration complete!')
  console.log('\nRegistered items:')
  items.forEach(item => {
    console.log(`  - ${item.name} (${item.type})`)
  })
  console.log(`\nPackage: ${packageData.name}`)
  console.log(`  Contains: ${items.length} items`)

  process.exit(0)
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
