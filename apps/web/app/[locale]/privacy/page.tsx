/**
 * Privacy policy page
 *
 * Public page describing MCP data collection practices and opt-out methods.
 * Accessible without authentication.
 */
import { ServerHeader } from '@/components/layout/ServerHeader'

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'AI Toolkit'
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'admin@example.com'

export const metadata = {
  title: `Privacy Policy - ${SITE_NAME}`,
  description: 'MCP 서버 데이터 수집 정책 및 옵트아웃 안내',
}

export default function PrivacyPage() {
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
          Privacy Policy
        </p>
        <h1
          className="text-4xl md:text-5xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-8"
          style={{ fontFamily: 'var(--font-newsreader)' }}
        >
          데이터 수집{' '}
          <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
            정책
          </span>
        </h1>

        <div className="space-y-10 text-[var(--text-secondary)] leading-relaxed">
          {/* 1. 개요 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. 개요</h2>
            <p>
              {SITE_NAME}은 Claude Code 스킬 공유 플랫폼입니다.
              MCP(Model Context Protocol) 서버를 통해 스킬 검색, 조회, 배포 기능을 제공하며,
              서비스 개선을 위해 최소한의 사용 데이터를 수집합니다.
            </p>
            <p className="mt-2">
              본 정책은 MCP 서버 사용 데이터에만 적용됩니다.
              웹 인증(Google OAuth) 및 쿠키는 별도의 브라우저 세션 관리에 사용되며 본 정책의 범위 밖입니다.
            </p>
          </section>

          {/* 2. 수집 데이터 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. 수집 데이터</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-2 pr-4 text-[var(--text-primary)]">항목</th>
                    <th className="text-left py-2 pr-4 text-[var(--text-primary)]">목적</th>
                    <th className="text-left py-2 text-[var(--text-primary)]">보존 기간</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-secondary)]">
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">mcp_audit_logs</td>
                    <td className="py-2 pr-4">IP 해시, User-Agent, 클라이언트 정보, 요청/응답 메타데이터 — 보안 모니터링 및 디버깅</td>
                    <td className="py-2">30일</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">mcp_sessions</td>
                    <td className="py-2 pr-4">세션 집계, 행동 로그 — 사용 패턴 분석</td>
                    <td className="py-2">세션 종료 시</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">skill_events</td>
                    <td className="py-2 pr-4">검색, 조회, 배포 이벤트 — 스킬 품질 지표</td>
                    <td className="py-2">무기한</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">gpters-analytics</td>
                    <td className="py-2 pr-4">익명화 이벤트 외부 전송 — 집계 통계</td>
                    <td className="py-2">외부 서비스 정책에 따름</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. 수집하지 않는 것 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. 수집하지 않는 것</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>코드 내용 또는 파일 시스템 데이터</li>
              <li>Claude와의 대화 내용</li>
              <li>로컬 파일 경로 또는 프로젝트 구조</li>
              <li>해시되지 않은 IP 주소 (원본 IP는 저장하지 않음)</li>
              <li>비밀번호, 토큰, 인증 정보 원문</li>
            </ul>
          </section>

          {/* 4. 옵트아웃 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. 옵트아웃 방법</h2>
            <p className="mb-3">
              MCP 요청 시 <code className="px-1.5 py-0.5 bg-[var(--bg-secondary)] rounded text-xs font-mono">X-Analytics-Opt-Out: true</code> 헤더를 포함하면
              감사 로그, 세션 추적, 스킬 이벤트 기록, 외부 전송이 모두 비활성화됩니다.
            </p>
            <p className="mb-3">
              Rate limiting 및 보안 기능은 옵트아웃과 무관하게 유지되며, MCP 도구 응답에도 영향이 없습니다.
            </p>

            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Claude Code 설정 예시</h3>
            <p className="mb-2 text-sm">
              <code className="px-1.5 py-0.5 bg-[var(--bg-secondary)] rounded text-xs font-mono">~/.claude/settings.json</code>의
              MCP 서버 설정에 헤더를 추가하세요:
            </p>
            <pre className="bg-[var(--bg-secondary)] rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed">
{`{
  "mcpServers": {
    "gpters-ai-toolkit": {
      "type": "http",
      "url": "https://ai-toolkit.gpters.org/api/mcp",
      "headers": {
        "X-Analytics-Opt-Out": "true"
      }
    }
  }
}`}
            </pre>
          </section>

          {/* 5. 문의 */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. 문의</h2>
            <p>
              데이터 수집에 대한 질문이나 삭제 요청은{' '}
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
