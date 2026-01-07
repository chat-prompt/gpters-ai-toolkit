/**
 * Auth error page
 *
 * Displays authentication error messages with explanations
 * for access denied, configuration, and verification failures.
 */
import Link from 'next/link'
import Image from 'next/image'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const errorMessages: Record<string, { title: string; description: string }> = {
    AccessDenied: {
      title: '접근 권한 없음',
      description: '@gpters.org 이메일 계정만 로그인할 수 있습니다.',
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
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] mb-4">
            <Image
              src="/gpters-logo.svg"
              alt="GPTers"
              width={40}
              height={40}
              className="rounded-lg"
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-secondary)] rounded-2xl p-8 border border-[var(--border-subtle)]">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
              <svg
                className="w-6 h-6 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-1">
              {errorInfo.title}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {errorInfo.description}
            </p>
          </div>

          <Link
            href="/auth/signin"
            className="block w-full text-center px-4 py-3 rounded-xl bg-[var(--accent-cyan)] text-black text-sm font-medium hover:opacity-90 transition-opacity"
          >
            다시 로그인
          </Link>
        </div>
      </div>
    </div>
  )
}
