/**
 * Migration script for cli_tools table + 25 tool seed (DEV-3062)
 *
 * Usage: set -a && source .env.local && set +a && node scripts/migrate-cli-tools.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { neon } = require('../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.js')

const sql = neon(process.env.DATABASE_URL)

const SEED_DATA = [
  // Tier 1 (필수, 80%+ 실습 출현)
  { id: 'node', name: 'Node.js', install_command: 'brew install node', latest_version: '22.14.0', npm_package: null, sync_source: 'github', context7_library_id: '/nodejs/node', related_tags: ['node', 'javascript', 'typescript', 'backend'], tier: 1 },
  { id: 'npm', name: 'npm', install_command: 'npm install -g npm', latest_version: '10.9.2', npm_package: 'npm', sync_source: 'npm', context7_library_id: null, related_tags: ['npm', 'package-manager', 'javascript'], tier: 1 },
  { id: 'npx', name: 'npx', install_command: 'npm install -g npx', latest_version: null, npm_package: null, sync_source: null, context7_library_id: null, related_tags: ['npx', 'npm', 'cli'], tier: 1 },
  { id: 'python', name: 'Python', install_command: 'brew install python', latest_version: '3.12.8', npm_package: null, sync_source: 'pypi', context7_library_id: null, related_tags: ['python', 'pip', 'data-science', 'ai'], tier: 1 },
  { id: 'git', name: 'Git', install_command: 'brew install git', latest_version: '2.47.1', npm_package: null, sync_source: 'github', context7_library_id: null, related_tags: ['git', 'version-control', 'github'], tier: 1 },
  { id: 'docker', name: 'Docker', install_command: 'brew install --cask docker', latest_version: '27.5.1', npm_package: null, sync_source: 'github', context7_library_id: null, related_tags: ['docker', 'container', 'devops', 'deployment'], tier: 1 },

  // Tier 2 (빈출, 40-80%)
  { id: 'pnpm', name: 'pnpm', install_command: 'npm install -g pnpm', latest_version: '9.15.4', npm_package: 'pnpm', sync_source: 'npm', context7_library_id: null, related_tags: ['pnpm', 'package-manager', 'monorepo'], tier: 2 },
  { id: 'bun', name: 'Bun', install_command: 'curl -fsSL https://bun.sh/install | bash', latest_version: '1.2.4', npm_package: null, sync_source: 'github', context7_library_id: '/oven-sh/bun', related_tags: ['bun', 'javascript', 'runtime', 'bundler'], tier: 2 },
  { id: 'vite', name: 'Vite', install_command: 'npm create vite@latest', latest_version: '6.1.0', npm_package: 'vite', sync_source: 'npm', context7_library_id: '/vitejs/vite', related_tags: ['vite', 'bundler', 'frontend', 'react', 'vue'], tier: 2 },
  { id: 'playwright', name: 'Playwright', install_command: 'npm init playwright@latest', latest_version: '1.50.1', npm_package: '@playwright/test', sync_source: 'npm', context7_library_id: '/microsoft/playwright', related_tags: ['playwright', 'e2e', 'testing', 'browser'], tier: 2 },
  { id: 'jest', name: 'Jest', install_command: 'npm install -D jest', latest_version: '29.7.0', npm_package: 'jest', sync_source: 'npm', context7_library_id: '/jestjs/jest', related_tags: ['jest', 'testing', 'unit-test', 'javascript'], tier: 2 },
  { id: 'eslint', name: 'ESLint', install_command: 'npm install -D eslint', latest_version: '9.19.0', npm_package: 'eslint', sync_source: 'npm', context7_library_id: '/eslint/eslint', related_tags: ['eslint', 'linter', 'code-quality', 'javascript'], tier: 2 },
  { id: 'prettier', name: 'Prettier', install_command: 'npm install -D prettier', latest_version: '3.4.2', npm_package: 'prettier', sync_source: 'npm', context7_library_id: '/prettier/prettier', related_tags: ['prettier', 'formatter', 'code-style'], tier: 2 },

  // Tier 3 (일반, 10-40%)
  { id: 'turbo', name: 'Turborepo', install_command: 'npm install -g turbo', latest_version: '2.4.4', npm_package: 'turbo', sync_source: 'npm', context7_library_id: '/vercel/turborepo', related_tags: ['turbo', 'monorepo', 'build-system'], tier: 3 },
  { id: 'prisma', name: 'Prisma', install_command: 'npm install -D prisma', latest_version: '6.3.1', npm_package: 'prisma', sync_source: 'npm', context7_library_id: '/prisma/prisma', related_tags: ['prisma', 'orm', 'database', 'postgresql', 'mysql'], tier: 3 },
  { id: 'drizzle-kit', name: 'Drizzle Kit', install_command: 'npm install -D drizzle-kit', latest_version: '0.30.4', npm_package: 'drizzle-kit', sync_source: 'npm', context7_library_id: '/drizzle-team/drizzle-orm', related_tags: ['drizzle', 'orm', 'database', 'migration', 'postgresql'], tier: 3 },
  { id: 'supabase', name: 'Supabase CLI', install_command: 'npm install -g supabase', latest_version: '2.15.8', npm_package: 'supabase', sync_source: 'npm', context7_library_id: '/supabase/supabase', related_tags: ['supabase', 'database', 'auth', 'storage', 'baas'], tier: 3 },
  { id: 'stripe-cli', name: 'Stripe CLI', install_command: 'brew install stripe/stripe-cli/stripe', latest_version: '1.23.8', npm_package: null, sync_source: 'github', context7_library_id: '/stripe/stripe-node', related_tags: ['stripe', 'payment', 'billing', 'webhook'], tier: 3 },
  { id: 'vercel', name: 'Vercel CLI', install_command: 'npm install -g vercel', latest_version: '41.4.1', npm_package: 'vercel', sync_source: 'npm', context7_library_id: '/vercel/next.js', related_tags: ['vercel', 'deployment', 'hosting', 'next.js'], tier: 3 },
  { id: 'gh', name: 'GitHub CLI', install_command: 'brew install gh', latest_version: '2.67.0', npm_package: null, sync_source: 'github', context7_library_id: null, related_tags: ['github', 'git', 'pr', 'issue', 'ci-cd'], tier: 3 },
  { id: 'aws', name: 'AWS CLI', install_command: 'brew install awscli', latest_version: '2.22.35', npm_package: null, sync_source: 'github', context7_library_id: null, related_tags: ['aws', 'cloud', 's3', 'lambda', 'ec2', 'devops'], tier: 3 },
  { id: 'firebase', name: 'Firebase CLI', install_command: 'npm install -g firebase-tools', latest_version: '13.29.1', npm_package: 'firebase-tools', sync_source: 'npm', context7_library_id: '/firebase/firebase-js-sdk', related_tags: ['firebase', 'google', 'hosting', 'firestore', 'auth'], tier: 3 },
  { id: 'terraform', name: 'Terraform', install_command: 'brew install terraform', latest_version: '1.10.5', npm_package: null, sync_source: 'github', context7_library_id: null, related_tags: ['terraform', 'iac', 'infrastructure', 'devops', 'cloud'], tier: 3 },
  { id: 'k6', name: 'k6', install_command: 'brew install k6', latest_version: '0.56.0', npm_package: null, sync_source: 'github', context7_library_id: null, related_tags: ['k6', 'load-testing', 'performance', 'testing'], tier: 3 },
  { id: 'vitest', name: 'Vitest', install_command: 'npm install -D vitest', latest_version: '3.0.5', npm_package: 'vitest', sync_source: 'npm', context7_library_id: '/vitest-dev/vitest', related_tags: ['vitest', 'testing', 'vite', 'unit-test', 'typescript'], tier: 3 },
]

async function run() {
  console.log('=== CLI Tools Migration (DEV-3062) ===\n')

  // Step 1: Create table
  console.log('Step 1: Creating cli_tools table...')
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "cli_tools" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "install_command" text NOT NULL,
      "latest_version" text,
      "npm_package" text,
      "sync_source" text DEFAULT 'npm',
      "context7_library_id" text,
      "related_tags" text[],
      "tier" integer DEFAULT 3,
      "created_at" timestamp with time zone DEFAULT now(),
      "updated_at" timestamp with time zone DEFAULT now()
    )
  `)
  console.log('  OK: Table created')

  // Step 2: Upsert seed data
  console.log('\nStep 2: Upserting 25 CLI tools...')
  for (const tool of SEED_DATA) {
    await sql`
      INSERT INTO cli_tools (id, name, install_command, latest_version, npm_package, sync_source, context7_library_id, related_tags, tier, updated_at)
      VALUES (${tool.id}, ${tool.name}, ${tool.install_command}, ${tool.latest_version},
              ${tool.npm_package}, ${tool.sync_source}, ${tool.context7_library_id},
              ${tool.related_tags}, ${tool.tier}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        install_command = EXCLUDED.install_command,
        latest_version = EXCLUDED.latest_version,
        npm_package = EXCLUDED.npm_package,
        sync_source = EXCLUDED.sync_source,
        context7_library_id = EXCLUDED.context7_library_id,
        related_tags = EXCLUDED.related_tags,
        tier = EXCLUDED.tier,
        updated_at = NOW()
    `
    console.log(`  OK: ${tool.id} — ${tool.name} (tier ${tool.tier})`)
  }

  // Step 3: Verify
  const result = await sql`SELECT id, name, tier FROM cli_tools ORDER BY tier, id`
  console.log(`\nStep 3: Verification — ${result.length} tools`)
  for (const tier of [1, 2, 3]) {
    const items = result.filter(r => r.tier === tier)
    console.log(`  Tier ${tier}: ${items.map(r => r.id).join(', ')}`)
  }

  console.log('\n=== Migration complete ===')
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
