import { db, users } from '@gpters/db'
import { eq } from 'drizzle-orm'
import type { UserRole } from '../security/rbac'

const ALLOWED_DAYS = new Set([7, 30, 90])

export type AxReadError = 'unauthenticated' | 'forbidden' | 'unknown_panel' | 'invalid_days'

type AxReadResult =
  | { ok: true; value: unknown }
  | { ok: false; error: AxReadError }

async function viewerFor(userId?: string, userRole?: string) {
  const { resolveAxViewer } = await import('../features/ax')
  if (!userId) return resolveAxViewer(null)
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  return resolveAxViewer({ email: user?.email, role: userRole as UserRole | undefined })
}

/** AX MCP access is limited to organization panels until a separate admin scope is introduced. */
export async function listReadableAxPanels(userId?: string, userRole?: string): Promise<AxReadResult> {
  const viewer = await viewerFor(userId, userRole)
  if (!viewer.canAccess) return { ok: false, error: viewer.reason === 'unauthenticated' ? 'unauthenticated' : 'forbidden' }
  const { listAxPanels } = await import('../features/ax')
  return { ok: true, value: listAxPanels({ ...viewer, isAdmin: false }) }
}

export async function readAxPanel(
  panelId: string,
  days: number,
  userId?: string,
  userRole?: string
): Promise<AxReadResult> {
  if (!ALLOWED_DAYS.has(days)) return { ok: false, error: 'invalid_days' }
  const viewer = await viewerFor(userId, userRole)
  if (!viewer.canAccess) return { ok: false, error: viewer.reason === 'unauthenticated' ? 'unauthenticated' : 'forbidden' }
  const { getAxPanel, canViewPanel } = await import('../features/ax')
  const panel = getAxPanel(panelId)
  if (!panel) return { ok: false, error: 'unknown_panel' }
  // Do not pass administrator privileges into panel.load: some org panels add personal data for admins.
  const orgViewer = { ...viewer, isAdmin: false }
  if (!canViewPanel(orgViewer, panel.meta.visibility)) return { ok: false, error: 'forbidden' }
  return { ok: true, value: await panel.load({ days, isAdmin: false }) }
}
