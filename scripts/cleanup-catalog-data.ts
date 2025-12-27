/**
 * Catalog Data Cleanup Script
 *
 * This script updates catalog items to improve data quality for vibe coders:
 * 1. Adds missing type-specific fields to agents (agentModel, agentPermissionMode, allowedTools)
 * 2. Adds missing allowedTools to skills
 * 3. Adds argument hints to commands
 * 4. Improves descriptions for better UX
 *
 * Run with: pnpm tsx scripts/cleanup-catalog-data.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
config({ path: resolve(__dirname, '../.env.local') })

// Verify database URL is loaded
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL not found in .env.local')
  console.error('Looking for:', resolve(__dirname, '../.env.local'))
  process.exit(1)
}

import { eq } from 'drizzle-orm'
import { db, catalogItems } from '../lib/db'

interface UpdateSpec {
  id: string
  updates: Record<string, unknown>
}

const agentUpdates: UpdateSpec[] = [
  {
    id: 'research-assistant',
    updates: {
      agentModel: 'sonnet',
      agentPermissionMode: 'default',
      allowedTools: 'Read, Grep, Glob, WebFetch, WebSearch',
      description: '기술 리서치 및 비교 분석을 수행하는 AI 에이전트. 라이브러리 선택, 아키텍처 결정 등에 활용하세요.',
    }
  },
  {
    id: 'code-reviewer',
    updates: {
      agentModel: 'sonnet',
      agentPermissionMode: 'default',
      allowedTools: 'Read, Grep, Glob',
      description: '코드 리뷰를 수행하고 개선점을 제안하는 AI 에이전트. PR 리뷰나 코드 품질 점검에 활용하세요.',
    }
  }
]

const skillUpdates: UpdateSpec[] = [
  {
    id: 'refactor-guide',
    updates: {
      allowedTools: 'Read, Grep, Glob',
      description: '코드 스멜을 분석하고 리팩토링 가이드를 제공합니다. 복잡한 코드 개선 시 활용하세요.',
    }
  }
]

const commandUpdates: UpdateSpec[] = [
  {
    id: 'api-docs',
    updates: {
      commandArgumentHint: '[파일경로] [--format openapi|markdown]',
      description: 'API 엔드포인트 코드를 분석하여 문서를 자동 생성합니다. OpenAPI 스펙 또는 마크다운 형식으로 출력 가능.',
    }
  },
  {
    id: 'commit-message',
    updates: {
      commandArgumentHint: '[--type feat|fix|docs|refactor]',
      description: 'Git 스테이징된 변경사항을 분석하여 컨벤셔널 커밋 메시지를 생성합니다.',
    }
  },
  {
    id: 'debug-helper',
    updates: {
      commandArgumentHint: '[에러메시지]',
      description: '에러 메시지와 스택 트레이스를 분석하여 원인과 해결책을 제시합니다.',
    }
  },
  {
    id: 'explain-code',
    updates: {
      commandArgumentHint: '[파일경로] [--level beginner|intermediate|advanced]',
      description: '복잡한 코드를 분석하여 이해하기 쉬운 설명과 다이어그램을 제공합니다.',
    }
  },
  {
    id: 'pr-description',
    updates: {
      commandArgumentHint: '[--base main]',
      description: '현재 브랜치의 변경사항을 분석하여 상세한 PR 설명을 자동 생성합니다.',
    }
  },
  {
    id: 'sql-generator',
    updates: {
      commandArgumentHint: '[자연어 쿼리 설명] [--dialect postgres|mysql|sqlite]',
      description: '자연어로 원하는 데이터를 설명하면 최적화된 SQL 쿼리를 생성합니다.',
    }
  },
  {
    id: 'test-writer',
    updates: {
      commandArgumentHint: '[파일경로] [--coverage --mock]',
      description: '함수, 클래스, 컴포넌트의 코드를 분석하여 단위 테스트를 자동 생성합니다.',
    }
  }
]

async function updateItems(updates: UpdateSpec[], typeName: string) {
  console.log(`\n=== Updating ${typeName}s ===`)

  for (const { id, updates: data } of updates) {
    try {
      const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

      if (!existing) {
        console.log(`  [SKIP] ${id} - not found`)
        continue
      }

      await db.update(catalogItems)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(catalogItems.id, id))

      console.log(`  [OK] ${id} - updated`)
    } catch (error) {
      console.error(`  [ERROR] ${id}:`, error)
    }
  }
}

async function main() {
  console.log('Starting catalog data cleanup...')
  console.log('================================')

  await updateItems(agentUpdates, 'agent')
  await updateItems(skillUpdates, 'skill')
  await updateItems(commandUpdates, 'command')

  console.log('\n================================')
  console.log('Cleanup complete!')

  // Summary
  const items = await db.select().from(catalogItems)
  const summary = {
    total: items.length,
    withAgentModel: items.filter(i => i.agentModel).length,
    withAllowedTools: items.filter(i => i.allowedTools).length,
    withArgumentHint: items.filter(i => i.commandArgumentHint).length,
  }

  console.log('\nSummary:')
  console.log(`  Total items: ${summary.total}`)
  console.log(`  With agentModel: ${summary.withAgentModel}`)
  console.log(`  With allowedTools: ${summary.withAllowedTools}`)
  console.log(`  With argumentHint: ${summary.withArgumentHint}`)

  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
