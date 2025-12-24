import { signIn } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  // If already signed in, redirect to callback URL or home
  if (session) {
    redirect(callbackUrl || '/')
  }

  return (
    <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 glass rounded-2xl p-12 max-w-md w-full mx-4 text-center">
        <div className="text-4xl mb-6">🔐</div>
        <h1 className="text-2xl font-light text-[var(--text-primary)] mb-2">
          GPTers AI Toolkit
        </h1>
        <p className="text-[var(--text-secondary)] mb-8">
          gpters.org 팀원만 접근할 수 있습니다
        </p>

        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: callbackUrl || '/' })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white text-gray-800 font-medium hover:bg-gray-100 transition-colors"
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
            Google로 로그인
          </button>
        </form>

        <p className="text-xs text-[var(--text-muted)] mt-6">
          @gpters.org 이메일 계정만 로그인할 수 있습니다
        </p>
      </div>
    </div>
  )
}
