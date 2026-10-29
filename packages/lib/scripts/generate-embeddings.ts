import { db, catalogItems } from '@gpters/db'
import { isNull, eq } from 'drizzle-orm'
import { generateEmbedding, prepareTextForEmbedding } from '../src/search/embedding'

const BATCH_SIZE = 10
const DELAY_MS = 500

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --all: 임베딩이 이미 있는 항목도 다시 만든다. 임베딩에 넣는 글을 바꾼 뒤(DEV-4697, 이름·설명·태그만) 한 번 돌린다.
// 운영 DB에 돌리는 건 백필이라 승인 뒤에만 한다
const regenerateAll = process.argv.includes('--all')

async function generateEmbeddings(): Promise<void> {
  console.log(`Starting embedding generation (${regenerateAll ? 'all items' : 'items without embeddings'})...`)

  const itemsWithoutEmbedding = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      description: catalogItems.description,
      content: catalogItems.content,
      tags: catalogItems.tags,
      readme: catalogItems.readme,
    })
    .from(catalogItems)
    .where(regenerateAll ? undefined : isNull(catalogItems.embedding))

  console.log(`Found ${itemsWithoutEmbedding.length} items${regenerateAll ? '' : ' without embeddings'}`)

  if (itemsWithoutEmbedding.length === 0) {
    console.log('All items already have embeddings. Done!')
    return
  }

  let processed = 0
  let failed = 0

  for (let i = 0; i < itemsWithoutEmbedding.length; i += BATCH_SIZE) {
    const batch = itemsWithoutEmbedding.slice(i, i + BATCH_SIZE)

    for (const item of batch) {
      try {
        const text = prepareTextForEmbedding(item)
        if (!text) {
          console.log(`Skipping ${item.id}: no text content`)
          continue
        }

        const embedding = await generateEmbedding(text)
        await db.update(catalogItems).set({ embedding }).where(eq(catalogItems.id, item.id))

        processed++
        console.log(`[${processed}/${itemsWithoutEmbedding.length}] Generated embedding for: ${item.name}`)
      } catch (error) {
        failed++
        console.error(`Failed to generate embedding for ${item.id}:`, error)
      }
    }

    if (i + BATCH_SIZE < itemsWithoutEmbedding.length) {
      await sleep(DELAY_MS)
    }
  }

  console.log(`\nDone! Processed: ${processed}, Failed: ${failed}`)
}

generateEmbeddings()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
