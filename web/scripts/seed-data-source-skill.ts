import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { db, catalogItems } from '../lib/db'
import { readFileSync } from 'fs'
import { join } from 'path'

async function seedDataSourceSkill() {
  const skillContent = readFileSync(
    join(__dirname, '../../plugins/data-source-reference/skills/data-source-reference/SKILL.md'),
    'utf-8'
  )

  const newItem = {
    id: 'data-source-reference',
    type: 'skill' as const,
    name: '데이터 소스 레퍼런스',
    description: 'GPTers 플랫폼의 데이터 소스 레퍼런스 - Portal DB와 Airtable 테이블 구조, 동기화 방향, ID 매핑 관계 참조',
    author: 'gpters-team',
    tags: ['database', 'airtable', 'postgresql', 'schema', 'sync'],
    teamTag: 'data' as const,
    difficulty: 'medium' as const,
    pluginId: 'data-source-reference',
    content: skillContent,
    allowedTools: 'Read',
    marketplaceEnabled: true,
    marketplaceVersion: '1.0.0',
  }

  try {
    await db.insert(catalogItems).values(newItem).onConflictDoUpdate({
      target: catalogItems.id,
      set: {
        name: newItem.name,
        description: newItem.description,
        content: newItem.content,
        tags: newItem.tags,
        teamTag: newItem.teamTag,
        updatedAt: new Date(),
      },
    })
    console.log('✅ data-source-reference skill added successfully!')
  } catch (error) {
    console.error('❌ Failed to add skill:', error)
    process.exit(1)
  }

  process.exit(0)
}

seedDataSourceSkill()
