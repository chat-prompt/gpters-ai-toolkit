/**
 * Generate embeddings for mcp_servers and cli_tools tables
 *
 * Usage: cd apps/web && set -a && source .env.local && set +a && node ../../scripts/embed-mcp-cli.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { neon } = require('../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.js')
const OpenAI = require('../node_modules/.pnpm/openai@6.25.0_ws@8.19.0_zod@4.3.5/node_modules/openai/index.js').default

const sql = neon(process.env.DATABASE_URL)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'text-embedding-3-large'
const DIMS = 3072

/**
 * Generate embedding for a single text
 */
async function embed(text) {
  const response = await openai.embeddings.create({
    model: MODEL,
    input: text.slice(0, 28000),
    dimensions: DIMS,
  })
  return response.data[0].embedding
}

/**
 * Build embedding text for an MCP server
 */
function mcpText(server) {
  const parts = [
    server.label,
    server.description,
    (server.use_cases || []).join(' '),
    server.fallback_approach || '',
  ]
  return parts.filter(Boolean).join(' ').trim()
}

/**
 * Build embedding text for a CLI tool
 */
function cliText(tool) {
  const parts = [
    tool.name,
    tool.install_command,
    (tool.related_tags || []).join(' '),
  ]
  return parts.filter(Boolean).join(' ').trim()
}

/**
 * Format embedding array as pgvector literal: [0.1,0.2,...]
 */
function toPgVector(arr) {
  return `[${arr.join(',')}]`
}

async function main() {
  console.log('=== MCP 서버 임베딩 생성 ===')
  const mcpServers = await sql`
    SELECT id, label, description, use_cases, fallback_approach
    FROM mcp_servers
    WHERE embedding IS NULL
    ORDER BY id
  `
  console.log(`  대상: ${mcpServers.length}개`)

  for (const server of mcpServers) {
    const text = mcpText(server)
    const embedding = await embed(text)
    await sql`
      UPDATE mcp_servers
      SET embedding = ${toPgVector(embedding)}::halfvec(3072)
      WHERE id = ${server.id}
    `
    console.log(`  ✅ ${server.id} (${text.length}chars)`)
  }

  console.log('\n=== CLI 도구 임베딩 생성 ===')
  const cliTools = await sql`
    SELECT id, name, install_command, related_tags
    FROM cli_tools
    WHERE embedding IS NULL
    ORDER BY id
  `
  console.log(`  대상: ${cliTools.length}개`)

  for (const tool of cliTools) {
    const text = cliText(tool)
    const embedding = await embed(text)
    await sql`
      UPDATE cli_tools
      SET embedding = ${toPgVector(embedding)}::halfvec(3072)
      WHERE id = ${tool.id}
    `
    console.log(`  ✅ ${tool.id} (${text.length}chars)`)
  }

  // Verify
  const [mcpDone] = await sql`SELECT count(*) as cnt FROM mcp_servers WHERE embedding IS NOT NULL`
  const [cliDone] = await sql`SELECT count(*) as cnt FROM cli_tools WHERE embedding IS NOT NULL`
  console.log(`\n=== 완료 ===`)
  console.log(`MCP 서버: ${mcpDone.cnt}개 임베딩 완료`)
  console.log(`CLI 도구: ${cliDone.cnt}개 임베딩 완료`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
