import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'fs'

async function main() {
  const { db, catalogItems } = await import('../lib/db')
  const { eq } = await import('drizzle-orm')
  
  const itemId = process.argv[2]
  const filePath = process.argv[3]
  
  if (!itemId || !filePath) {
    console.log('Usage: npx tsx scripts/sync-catalog-item.ts <item-id> <file-path>')
    process.exit(1)
  }
  
  const content = readFileSync(filePath, 'utf-8')
  await db.update(catalogItems)
    .set({ content, updatedAt: new Date() })
    .where(eq(catalogItems.id, itemId))
  
  console.log(`✅ Updated ${itemId}`)
  process.exit(0)
}

main().catch(e => {
  console.error('❌ Failed:', e)
  process.exit(1)
})
