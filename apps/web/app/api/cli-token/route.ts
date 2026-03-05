/**
 * CLI 토큰 발급 API
 *
 * NextAuth 세션 인증 후 aitk CLI용 장기 API 토큰을 발급합니다.
 * GET: 브라우저에서 호출 - 세션 확인 후 토큰 발급, localhost로 리다이렉트
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { db, oauthClients, users } from '@/lib/db'
import { createAccessToken } from '@/lib/security/oauth-tokens'
import { createLogger } from '@/lib/core/logger'
import { eq } from 'drizzle-orm'

const log = createLogger('api:cli-token')

/** aitk-cli OAuth 클라이언트 ID */
const CLI_CLIENT_ID = 'aitk-cli'
/** CLI 토큰 만료: 90일 */
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

/**
 * aitk-cli OAuth 클라이언트가 DB에 존재하는지 확인하고, 없으면 생성
 *
 * @returns 클라이언트 ID
 */
async function ensureCliClient(): Promise<string> {
  const [existing] = await db
    .select({ id: oauthClients.id })
    .from(oauthClients)
    .where(eq(oauthClients.id, CLI_CLIENT_ID))

  if (existing) return existing.id

  await db.insert(oauthClients).values({
    id: CLI_CLIENT_ID,
    name: 'aitk CLI',
    redirectUris: ['http://localhost'],
  })

  log.info('Created aitk-cli OAuth client')
  return CLI_CLIENT_ID
}

/**
 * GET /api/cli-token?port=PORT
 *
 * 1. NextAuth 세션 확인
 * 2. 세션 없으면 Google 로그인으로 리다이렉트 (callbackUrl=자기 자신)
 * 3. 세션 있으면 토큰 발급 후 localhost:PORT/callback?token=TOKEN 으로 리다이렉트
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const port = url.searchParams.get('port')

  // NextAuth 세션 확인
  const session = await auth()

  if (!session?.user?.email) {
    // 세션 없으면 Google 로그인으로 리다이렉트
    const callbackUrl = url.toString()
    return NextResponse.redirect(
      new URL(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, url.origin)
    )
  }

  try {
    // 사용자 ID 조회
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, session.user.email))

    if (!user) {
      log.warn('CLI token request from unknown user', { email: session.user.email })
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // CLI 클라이언트 확인/생성
    const clientId = await ensureCliClient()

    // 토큰 발급
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    const { token } = await createAccessToken({
      clientId,
      userId: user.id,
      scope: 'mcp:tools mcp:prompts',
      expiresAt,
    })

    log.info('CLI token issued', { userId: user.id, expiresAt: expiresAt.toISOString() })

    // localhost 콜백으로 리다이렉트
    if (port) {
      const callbackParams = new URLSearchParams({ token })
      if (session.user.email) callbackParams.set('email', session.user.email)
      return NextResponse.redirect(
        `http://localhost:${port}/callback?${callbackParams.toString()}`
      )
    }

    // port가 없으면 JSON으로 토큰 반환 (수동 복사용)
    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      message: 'aitk login --token <이 토큰> 으로 저장하세요',
    })
  } catch (err) {
    log.error('CLI token generation failed', { error: err })
    return NextResponse.json({ error: 'Token generation failed' }, { status: 500 })
  }
}
