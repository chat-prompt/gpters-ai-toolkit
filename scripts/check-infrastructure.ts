import 'dotenv/config'
import { db } from '../lib/db'
import { catalogItems, packageItems, catalogItemTags } from '../lib/db/schema'
import { like, or, eq } from 'drizzle-orm'

async function check() {
  // Find all items with 'infrastructure' in the name or ID
  const items = await db.select({
    id: catalogItems.id,
    name: catalogItems.name,
    type: catalogItems.type,
    createdAt: catalogItems.createdAt
  }).from(catalogItems).where(
    or(
      like(catalogItems.id, '%infrastructure%'),
      like(catalogItems.name, '%infrastructure%'),
      like(catalogItems.name, '%Infrastructure%')
    )
  )

  console.log('📋 Found infrastructure-related items:')
  if (items.length === 0) {
    console.log('  (none)')
  } else {
    items.forEach(i => console.log(`  - ${i.id} (${i.type}) - ${i.name} [${i.createdAt}]`))
  }

  // Check for any skill type with infrastructure
  const skillInfra = items.filter(i => i.type === 'skill')
  if (skillInfra.length > 0) {
    console.log('\n⚠️  Found skill type items that should be removed:')
    skillInfra.forEach(i => console.log(`  - ${i.id}`))

    // Delete them
    for (const item of skillInfra) {
      await db.delete(packageItems).where(eq(packageItems.itemId, item.id))
      await db.delete(catalogItemTags).where(eq(catalogItemTags.itemId, item.id))
      await db.delete(catalogItems).where(eq(catalogItems.id, item.id))
      console.log(`  ✅ Deleted: ${item.id}`)
    }
  }

  // Verify package exists
  const pkg = items.find(i => i.type === 'package')
  if (pkg) {
    console.log('\n✅ Package exists:', pkg.id)

    // Check package contents
    const contents = await db.select().from(packageItems).where(eq(packageItems.packageId, pkg.id))
    console.log('📦 Package contents:')
    contents.forEach(c => console.log(`  - ${c.itemId} (order: ${c.displayOrder})`))
  } else {
    console.log('\n❌ No package found!')
  }
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
