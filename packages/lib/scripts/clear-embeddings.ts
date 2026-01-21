import { db, catalogItems } from '@gpters/db'

async function main() {
  await db.update(catalogItems).set({ embedding: null })
  console.log('All embeddings cleared')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
