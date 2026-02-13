/**
 * Auth error page
 *
 * Displays authentication error messages with glassmorphism card
 * and animated gradient orb background. Provides explanations
 * for access denied, configuration, and verification failures.
 */
import Link from 'next/link'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const errorMessages: Record<string, { title: string; description: string }> = {
    AccessDenied: {
      title: '접근 권한 없음',
      description: '등록된 조직 도메인 이메일 계정만 로그인할 수 있습니다.',
    },
    Configuration: {
      title: '설정 오류',
      description: '인증 설정에 문제가 있습니다.',
    },
    Verification: {
      title: '인증 실패',
      description: '이메일 인증에 실패했습니다.',
    },
    Default: {
      title: '로그인 실패',
      description: '문제가 발생했습니다. 다시 시도해주세요.',
    },
  }

  const errorInfo = errorMessages[error || 'Default'] || errorMessages.Default

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] grid-pattern flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating gradient orbs */}
      <div
        aria-hidden="true"
        className="absolute top-[-10%] left-[-5%] w-72 h-72 rounded-full bg-[var(--accent-cyan)] opacity-20 blur-3xl animate-float-slow [.light_&]:opacity-10"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[-10%] right-[-5%] w-72 h-72 rounded-full bg-[var(--accent-purple)] opacity-20 blur-3xl animate-float-slow-delayed [.light_&]:opacity-10"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[10%] left-[30%] w-72 h-72 rounded-full bg-[var(--accent-green)] opacity-20 blur-3xl animate-float-slow-delayed-2 [.light_&]:opacity-10"
      />

      {/* Card */}
      <div className="w-full max-w-md relative z-10 animate-fade-up">
        <div className="glass rounded-2xl p-8 transition-all duration-200 hover:border-[var(--border-hover)]">
          {/* Error Icon */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-5" style={{ boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}>
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {errorInfo.title}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {errorInfo.description}
            </p>
          </div>

          <Link
            href="/auth/signin"
            className="cursor-pointer block w-full text-center px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm font-medium border border-[var(--border-subtle)] transition-all duration-200 hover:border-[var(--accent-cyan)]/50 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)]"
          >
            다시 로그인
          </Link>
        </div>
      </div>
    </div>
  )
}
