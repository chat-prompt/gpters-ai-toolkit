/**
 * Getting started page
 *
 * Interactive onboarding guide for setting up the MCP server
 * integration and Claude Code hooks with step-by-step instructions.
 */
import { setRequestLocale } from 'next-intl/server'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { auth } from '@/lib/core/auth'
import { isInternalEmail } from '@/lib/features/ax'
import { GettingStartedContent } from './GettingStartedContent'

/**
 * 시작 가이드 페이지
 *
 * @param params - locale 을 담은 라우트 파라미터
 */
export default async function GettingStartedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await auth()
  // 도메인 판정은 isInternalEmail 한 곳에서만 한다. 여기서 직접 비교하던 사본은
  // 환경변수 값에 붙은 공백·개행을 다듬지 않아 사내 구성원도 항상 false였다.
  const isInternal = isInternalEmail(session?.user?.email)

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
