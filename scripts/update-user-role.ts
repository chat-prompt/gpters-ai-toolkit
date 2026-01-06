import { db, users } from '../lib/db'
import { eq } from 'drizzle-orm'

async function updateUserRole() {
  const email = process.argv[2] || 'primadonna@gpters.org'
  const newRole = (process.argv[3] || 'admin') as 'admin' | 'editor' | 'viewer'

  console.log(`Updating role for ${email} to ${newRole}...`)

  // Check current role
  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (!user) {
    console.log('User not found:', email)
    process.exit(1)
  }

  console.log('Current user:', {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })

  // Update to new role
  await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.email, email))

  // Verify
  const [updated] = await db.select().from(users).where(eq(users.email, email))
  console.log('Updated user:', {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
  })

  console.log('Done!')
  process.exit(0)
}

updateUserRole().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
