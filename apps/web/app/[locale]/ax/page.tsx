/**
 * 사내 AX 대시보드 페이지
 *
 * 사내에서 AI를 얼마나·어떻게 쓰고 있는지 한 화면에서 본다.
 * 관리자 전용인 통계 화면과 달리, 사내 구성원 전원이 열람할 수 있다.
 */
import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { Footer } from '@/components/layout/Footer'
import { AxDashboard } from '@/components/ax'
import { listAxPanels, resolveAxViewer } from '@/lib/features/ax'
import type { UserRole } from '@/lib/security/rbac'

export const metadata = {
  title: 'AX 대시보드 - AI Toolkit',
  description: '사내 AI 사용 현황을 한 화면에서 확인하세요',
}

/**
 * AX 대시보드 페이지
 *
 * 패널 메타는 서버에서 미리 구해 넘긴다 — 첫 렌더에 목록 조회 왕복을 없애기 위함이다.
 */
export default async function AxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const session = await auth()
  const viewer = resolveAxViewer({
    email: session?.user?.email,
    role: session?.user?.role as UserRole | undefined,
  })

  if (!viewer.canAccess) {
    redirect('/')
  }

  const panels = listAxPanels(viewer)

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <ServerHeader />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-6 md:px-10 pt-10 pb-24">
        {/* 왼쪽 정렬 — 가운데 정렬 히어로를 쓰지 않는다 */}
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-medium tracking-tight text-[var(--text-primary)]">
            AX 대시보드
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {viewer.isAdmin ? 'Admin view' : 'Member view'}
          </p>
        </header>

        <AxDashboard panels={panels} isAdmin={viewer.isAdmin} />
      </main>

      <Footer label="AI Toolkit - AX 대시보드" />
    </div>
  )
}
