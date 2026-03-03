/**
 * Global 404 Not Found page
 *
 * Displayed when a route is not found. Uses glassmorphism UI
 * matching the auth error page style.
 */

import Link from 'next/link'

/**
 * Not found page component
 */
export default function NotFound() {
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

      {/* Card */}
      <div className="w-full max-w-md relative z-10 animate-fade-up">
        <div className="glass rounded-2xl p-8 transition-all duration-200 hover:border-[var(--border-hover)]">
          {/* 404 Icon */}
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-cyan)]/10 mb-5"
              style={{ boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)' }}
            >
              <svg
                className="w-8 h-8 text-[var(--accent-cyan)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              페이지를 찾을 수 없습니다
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              요청하신 페이지가 존재하지 않거나 이동되었습니다.
            </p>
          </div>

          <Link
            href="/"
            className="cursor-pointer block w-full text-center px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm font-medium border border-[var(--border-subtle)] transition-all duration-200 hover:border-[var(--accent-cyan)]/50 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)]"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}
