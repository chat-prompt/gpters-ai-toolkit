/**
 * Sign in page
 *
 * Authentication page with Google OAuth login for @gpters.org
 * domain users. Features glassmorphism card with animated gradient
 * orb background. Redirects authenticated users to callback URL.
 */
import { signIn } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { auth } from '@/lib/core/auth'
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

  // MCP OAuth 흐름에서 온 경우 자동으로 Google 로그인 시작
  if (callbackUrl?.includes('/oauth/authorize')) {
    try {
      await signIn('google', { redirectTo: callbackUrl })
    } catch (error) {
      // NEXT_REDIRECT는 정상 동작 (redirect가 throw로 구현됨)
      if (isRedirectError(error)) {
        throw error
      }
      // 실제 에러인 경우 로그 후 수동 로그인 폼 표시
      console.error('OAuth auto-redirect failed:', error)
    }
  }

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
        <div className="glass rounded-2xl p-8 transition-all duration-200 hover:border-[var(--border-hover)] hover:shadow-[var(--glow-cyan)]">
          {/* Logo & Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] mb-5 animate-glow-pulse">
              <Image
                src="/gpters-logo.svg"
                alt="AI Toolkit"
                width={48}
                height={48}
                className="rounded-lg"
              />
            </div>
            <h1 className="text-2xl font-semibold gradient-text-cyan mb-2">
              AI Toolkit
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              GPTers 팀을 위한 AI 도구 허브
            </p>
          </div>

          {/* Login Form */}
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: callbackUrl || '/' })
            }}
          >
            <button
              type="submit"
              className="cursor-pointer w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm font-medium border border-[var(--border-subtle)] transition-all duration-200 hover:border-[var(--accent-cyan)]/50 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)]"
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
        <div className="flex items-center justify-center gap-1.5 mt-6">
          <svg
            width={14}
            height={14}
            className="shrink-0 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          <p className="text-xs text-[var(--text-muted)]">
            등록된 조직 도메인 이메일만 허용됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
