/**
 * SDK + 도구 문서 동기화 스크립트 (EDU-6880, EDU-6881)
 *
 * 1. AI 3사 SDK 문서: chub CLI → ai_model_docs.sdk_docs
 * 2. 실습 빈출 도구 문서: chub CLI → cli_tools.raw_docs
 *
 * GitHub Actions 크론에서 실행.
 * 사용: cd packages/db && pnpm exec tsx scripts/sync-sdk-docs.ts
 * 환경변수: DATABASE_URL
 */

import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// --- AI 프로바이더 SDK 문서 (ai_model_docs 테이블) ---

const SDK_DOCS = [
  { provider: 'anthropic', chubId: 'anthropic/claude-api', lang: 'javascript' },
  { provider: 'anthropic', chubId: 'anthropic/package', lang: 'python' },
  { provider: 'google', chubId: 'gemini/genai', lang: 'javascript' },
  { provider: 'openai', chubId: 'openai/chat', lang: 'javascript' },
  { provider: 'openai', chubId: 'openai/package', lang: 'python' },
]

// --- 실습 빈출 도구 문서 (cli_tools 테이블) ---

const TOOL_DOCS = [
  { name: 'nextjs', chubId: 'next/next', lang: 'javascript' },
  { name: 'express', chubId: 'express/express', lang: 'javascript' },
  { name: 'prisma', chubId: 'prisma/orm', lang: 'javascript' },
  { name: 'playwright', chubId: 'playwright/playwright', lang: 'javascript' },
  { name: 'stripe', chubId: 'stripe/package', lang: 'python' },
  { name: 'supabase', chubId: 'supabase/client', lang: 'javascript' },
  { name: 'langchain', chubId: 'langchain/community', lang: 'python' },
  { name: 'cheerio', chubId: 'typescript/cheerio', lang: 'typescript' },
]

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function fetchChubDoc(chubId: string, lang: string): string | null {
  try {
    const result = execSync(
      `chub get ${chubId} --lang ${lang} --json`,
      { timeout: 30_000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const data = JSON.parse(result)
    return data.content || null
  } catch (err) {
    console.warn(`  ⚠️ chub get ${chubId} --lang ${lang} 실패: ${(err as Error).message.split('\n')[0]}`)
    return null
  }
}

async function syncProviderSdkDocs() {
  console.log('=== AI 프로바이더 SDK 문서 ===\n')

  const providerDocs = new Map<string, string[]>()

  for (const { provider, chubId, lang } of SDK_DOCS) {
    console.log(`  📡 ${chubId} (${lang})...`)
    const content = fetchChubDoc(chubId, lang)
    if (!content) continue

    const existing = providerDocs.get(provider) ?? []
    existing.push(content)
    providerDocs.set(provider, existing)
    console.log(`  ✅ ${chubId}: ${content.length} chars`)
  }

  let synced = 0
  let unchanged = 0

  for (const [provider, docs] of providerDocs) {
    const combined = docs.join('\n\n---\n\n')
    const hash = hashContent(combined)

    const existing = await sql`SELECT sdk_docs_hash FROM ai_model_docs WHERE provider = ${provider} LIMIT 1`

    if (existing.length > 0 && existing[0].sdk_docs_hash === hash) {
      console.log(`  ♻️ ${provider}: 변경 없음`)
      unchanged++
      continue
    }

    await sql`UPDATE ai_model_docs SET sdk_docs = ${combined}, sdk_docs_hash = ${hash}, updated_at = NOW() WHERE provider = ${provider}`

    synced++
    console.log(`  ✅ ${provider}: DB 업데이트 (${combined.length} chars)`)
  }

  console.log(`\n  SDK 결과: synced=${synced}, unchanged=${unchanged}\n`)
}

async function syncToolDocs() {
  console.log('=== 실습 빈출 도구 문서 ===\n')

  let synced = 0
  let unchanged = 0
  let notFound = 0

  for (const { name, chubId, lang } of TOOL_DOCS) {
    console.log(`  📡 ${chubId} (${lang})...`)
    const content = fetchChubDoc(chubId, lang)
    if (!content) { notFound++; continue }

    const hash = hashContent(content)

    // cli_tools에서 기존 raw_docs_hash 확인
    const existing = await sql`SELECT raw_docs_hash FROM cli_tools WHERE chub_doc_id = ${chubId} LIMIT 1`

    if (existing.length > 0 && existing[0].raw_docs_hash === hash) {
      console.log(`  ♻️ ${name}: 변경 없음`)
      unchanged++
      continue
    }

    // chub_doc_id로 매칭되는 row가 있으면 update, 없으면 name으로 시도
    const updated = await sql`
      UPDATE cli_tools
      SET raw_docs = ${content}, raw_docs_hash = ${hash}, chub_doc_id = ${chubId}, chub_lang = ${lang}, updated_at = NOW()
      WHERE chub_doc_id = ${chubId} OR id = ${name}
      RETURNING id
    `

    if (updated.length > 0) {
      synced++
      console.log(`  ✅ ${name}: DB 업데이트 (${content.length} chars)`)
    } else {
      console.log(`  ⚠️ ${name}: cli_tools에 매칭 row 없음 (chub_doc_id=${chubId})`)
    }
  }

  console.log(`\n  도구 결과: synced=${synced}, unchanged=${unchanged}, notFound=${notFound}\n`)
}

async function main() {
  console.log('🔄 SDK + 도구 문서 동기화 (chub CLI)\n')
  await syncProviderSdkDocs()
  await syncToolDocs()
  console.log('✅ 전체 동기화 완료')
}

main().catch((err) => {
  console.error('💥 예상치 못한 오류:', err)
  process.exit(1)
})
