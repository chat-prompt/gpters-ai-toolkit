import Link from 'next/link'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const errorMessages: Record<string, { title: string; description: string }> = {
    AccessDenied: {
      title: '접근이 거부되었습니다',
      description: 'gpters.org 도메인의 이메일 계정만 로그인할 수 있습니다.',
    },
    Configuration: {
      title: '설정 오류',
      description: '인증 설정에 문제가 있습니다. 관리자에게 문의하세요.',
    },
    Verification: {
      title: '인증 실패',
      description: '이메일 인증에 실패했습니다. 다시 시도해주세요.',
    },
    Default: {
      title: '로그인 오류',
      description: '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
    },
  }

  const errorInfo = errorMessages[error || 'Default'] || errorMessages.Default

  return (
    <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-red-500 opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 glass rounded-2xl p-12 max-w-md w-full mx-4 text-center">
        <div className="text-4xl mb-6">⚠️</div>
        <h1 className="text-2xl font-light text-[var(--text-primary)] mb-2">
          {errorInfo.title}
        </h1>
        <p className="text-[var(--text-secondary)] mb-8">
          {errorInfo.description}
        </p>

        <div className="space-y-3">
          <Link
            href="/auth/signin"
            className="block w-full px-6 py-3 rounded-xl bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            다시 로그인
          </Link>
          <a
            href="mailto:support@gpters.org"
            className="block w-full px-6 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            지원 요청
          </a>
        </div>
      </div>
    </div>
  )
}
