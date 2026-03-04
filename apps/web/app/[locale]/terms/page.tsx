/**
 * Terms of service page
 *
 * Public page describing service usage terms and conditions.
 * Accessible without authentication.
 */
import { setRequestLocale } from 'next-intl/server'
import { ServerHeader } from '@/components/layout/ServerHeader'

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'AI Toolkit'
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'admin@example.com'

export const metadata = {
  title: `Terms of Service - ${SITE_NAME}`,
  description: '서비스 이용약관',
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4">
          Terms of Service
        </p>
        <h1
          className="text-4xl md:text-5xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-8"
          style={{ fontFamily: 'var(--font-newsreader)' }}
        >
          이용{' '}
          <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
            약관
          </span>
        </h1>

        <div className="space-y-10 text-[var(--text-secondary)] leading-relaxed">
          {/* 1. 서비스 개요 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. 서비스 개요</h2>
            <p>
              {SITE_NAME}(이하 &quot;서비스&quot;)은 AI 코딩 도구용 스킬, 에이전트, 가이드를 공유하는 플랫폼입니다.
              MCP(Model Context Protocol) 서버를 통해 스킬 검색, 조회, 배포 기능을 제공합니다.
            </p>
          </section>

          {/* 2. 이용 조건 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. 이용 조건</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>서비스 이용을 위해 Google OAuth 인증이 필요합니다.</li>
              <li>서비스에 게시하는 콘텐츠(스킬, 에이전트, 가이드 등)는 본인이 작성했거나 배포 권한을 보유한 것이어야 합니다.</li>
              <li>악의적 코드, 보안 취약점을 의도적으로 포함한 콘텐츠를 배포해서는 안 됩니다.</li>
              <li>서비스를 통해 수집한 데이터를 무단으로 상업적 목적에 사용해서는 안 됩니다.</li>
            </ul>
          </section>

          {/* 3. 콘텐츠 권리 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. 콘텐츠 권리</h2>
            <p>
              사용자가 서비스에 게시한 콘텐츠의 지식재산권은 원저작자에게 있습니다.
              서비스에 콘텐츠를 게시함으로써, 다른 사용자가 해당 콘텐츠를 서비스 내에서
              검색, 조회, 설치할 수 있도록 비독점적 라이선스를 부여합니다.
            </p>
          </section>

          {/* 4. 면책 조항 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. 면책 조항</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>서비스는 &quot;있는 그대로&quot; 제공되며, 가용성이나 정확성에 대한 보증을 하지 않습니다.</li>
              <li>사용자가 설치한 스킬/에이전트로 인해 발생한 손해에 대해 서비스 운영자는 책임지지 않습니다.</li>
              <li>서비스는 사전 통지 없이 기능을 변경하거나 중단할 수 있습니다.</li>
            </ul>
          </section>

          {/* 5. 계정 및 접근 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. 계정 및 접근</h2>
            <p>
              서비스 운영자는 약관을 위반한 사용자의 접근을 제한하거나 계정을 비활성화할 수 있습니다.
              조직 관리자는 소속 구성원의 접근 권한을 관리할 수 있습니다.
            </p>
          </section>

          {/* 6. 약관 변경 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">6. 약관 변경</h2>
            <p>
              본 약관은 사전 통지 후 변경될 수 있습니다.
              변경된 약관은 서비스에 게시된 시점부터 효력이 발생합니다.
              중요한 변경 사항은 서비스 내 공지 또는 이메일로 안내합니다.
            </p>
          </section>

          {/* 7. 문의 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">7. 문의</h2>
            <p>
              이용약관에 대한 질문은{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--brand-primary)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              로 연락해 주세요.
            </p>
          </section>

          <p className="text-xs text-[var(--text-muted)] pt-4 border-t border-[var(--border-subtle)]">
            최종 업데이트: 2026년 3월
          </p>
        </div>
      </main>
    </div>
  )
}
