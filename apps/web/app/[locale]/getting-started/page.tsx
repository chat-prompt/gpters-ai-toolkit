/**
 * Getting started page
 *
 * Interactive onboarding guide for setting up the MCP server
 * integration and Claude Code hooks with step-by-step instructions.
 */
import { setRequestLocale } from 'next-intl/server'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { auth } from '@/lib/core/auth'
import { GettingStartedContent } from './GettingStartedContent'

/** Internal email domain for full plugin access (empty = no internal features) */
const INTERNAL_DOMAIN = process.env.INTERNAL_ORGANIZATION_DOMAIN || ''

/**
 * 시작 가이드 페이지
 *
 * @param params - locale 을 담은 라우트 파라미터
 */
export default async function GettingStartedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await auth()
  const email = session?.user?.email ?? ''
  const isInternal = INTERNAL_DOMAIN ? email.endsWith(`@${INTERNAL_DOMAIN}`) : false

  return (
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main">
        {/* 순서대로 읽어 내려가는 화면이라 본문 폭을 좁게 잡는다 */}
        <div className="mx-auto max-w-3xl">
          <GettingStartedContent isInternal={isInternal} />
        </div>
      </main>
    </div>
  )
}
