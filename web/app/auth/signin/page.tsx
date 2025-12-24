import { signIn } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Image from 'next/image'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  if (session) {
    redirect(callbackUrl || '/')
  }

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
          <h1 className="text-xl font-medium text-[var(--text-primary)]">
            AI Toolkit
          </h1>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-secondary)] rounded-2xl p-8 border border-[var(--border-subtle)]">
          <div className="text-center mb-6">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-1">
              로그인
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              GPTers 팀 계정으로 계속하기
            </p>
          </div>

          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: callbackUrl || '/' })
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google 계정으로 로그인
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          @gpters.org 이메일만 허용됩니다
        </p>
      </div>
    </div>
  )
}
