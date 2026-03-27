/**
 * API Key Management Endpoints
 *
 * 인증된 사용자가 자신의 API Key를 조회, 생성, 폐기할 수 있습니다.
 * 헤드리스 환경에서 `aitk login --token <key>`로 사용 가능한 토큰을 관리합니다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db, oauthAccessTokens } from '@/lib/db'
import { createAccessToken } from '@/lib/security/oauth-tokens'
import { ensureCliClient, CLI_CLIENT_ID, CLI_TOKEN_TTL_MS, CLI_TOKEN_SCOPE } from '@/lib/security/cli-client'
import { createLogger } from '@/lib/core/logger'
import { eq, and, desc } from 'drizzle-orm'

const log = createLogger('api:api-keys')

/** API Key 이름 최대 길이 */
const MAX_KEY_NAME_LENGTH = 100

/**
 * GET /api/api-keys
 *
 * 현재 유저의 API Key 목록을 반환합니다.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const keys = await db
      .select({
        id: oauthAccessTokens.id,
        name: oauthAccessTokens.name,
        scope: oauthAccessTokens.scope,
        isActive: oauthAccessTokens.isActive,
        expiresAt: oauthAccessTokens.expiresAt,
        lastUsedAt: oauthAccessTokens.lastUsedAt,
        usageCount: oauthAccessTokens.usageCount,
        createdAt: oauthAccessTokens.createdAt,
      })
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.userId, session.user.id),
          eq(oauthAccessTokens.clientId, CLI_CLIENT_ID)
        )
      )
      .orderBy(desc(oauthAccessTokens.createdAt))

    return NextResponse.json({ keys })
  } catch (err) {
    log.error('Failed to list API keys', { error: err })
    return NextResponse.json({ error: 'Failed to list keys' }, { status: 500 })
  }
}

/**
 * POST /api/api-keys
 *
 * 새 API Key를 생성합니다. raw token은 응답에서 한 번만 반환됩니다.
 *
 * @body { name: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name } = body
  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (name.length > MAX_KEY_NAME_LENGTH) {
    return NextResponse.json({ error: `name must be ${MAX_KEY_NAME_LENGTH} characters or less` }, { status: 400 })
  }

  try {
    const clientId = await ensureCliClient()
    const expiresAt = new Date(Date.now() + CLI_TOKEN_TTL_MS)

    const { token, id } = await createAccessToken({
      clientId,
      userId: session.user.id,
      scope: CLI_TOKEN_SCOPE,
      expiresAt,
    })

    // name 업데이트
    await db
      .update(oauthAccessTokens)
      .set({ name: name.trim() })
      .where(eq(oauthAccessTokens.id, id))

    log.info('API key created', { userId: session.user.id, keyId: id, name: name.trim() })

    return NextResponse.json({
      key: {
        id,
        name: name.trim(),
        token,
        expiresAt: expiresAt.toISOString(),
      },
    }, { status: 201 })
  } catch (err) {
    log.error('Failed to create API key', { error: err })
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 })
  }
}

/**
 * DELETE /api/api-keys
 *
 * API Key를 폐기합니다 (isActive = false).
 *
 * @body { id: string }
 */
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  try {
    // userId 검증: 자기 자신의 키만 폐기 가능
    const [existing] = await db
      .select({ userId: oauthAccessTokens.userId })
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.id, id))

    if (!existing) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized to revoke this key' }, { status: 403 })
    }

    await db
      .update(oauthAccessTokens)
      .set({ isActive: false })
      .where(eq(oauthAccessTokens.id, id))

    log.info('API key revoked', { userId: session.user.id, keyId: id })

    return NextResponse.json({ success: true })
  } catch (err) {
    log.error('Failed to revoke API key', { error: err })
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  }
}
