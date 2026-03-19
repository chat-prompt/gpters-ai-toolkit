/**
 * SDK 문서 동기화 스크립트 (EDU-6880)
 *
 * chub CLI로 3사 AI SDK 문서를 fetch하여 ai_model_docs.sdk_docs에 저장.
 * GitHub Actions 크론에서 실행.
 *
 * 사용: cd packages/db && npx tsx scripts/sync-sdk-docs.ts
 * 환경변수: DATABASE_URL
 */

import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

const SDK_DOCS = [
  { provider: 'anthropic', chubId: 'anthropic/claude-api', lang: 'javascript' },
  { provider: 'anthropic', chubId: 'anthropic/package', lang: 'python' },
  { provider: 'google', chubId: 'gemini/genai', lang: 'javascript' },
  { provider: 'openai', chubId: 'openai/chat', lang: 'javascript' },
  { provider: 'openai', chubId: 'openai/package', lang: 'python' },
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

async function main() {
  console.log('🔄 SDK 문서 동기화 (chub CLI)...\n')

  // 프로바이더별로 문서를 그룹핑
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

  // DB 업데이트 (raw SQL)
  let synced = 0
  let unchanged = 0

  for (const [provider, docs] of providerDocs) {
    const combined = docs.join('\n\n---\n\n')
    const hash = hashContent(combined)

    // 변경 감지
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

  console.log(`\n📊 결과: synced=${synced}, unchanged=${unchanged}`)
}

main().catch((err) => {
  console.error('💥 예상치 못한 오류:', err)
  process.exit(1)
})
