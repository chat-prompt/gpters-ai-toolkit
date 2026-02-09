/**
 * Client-side interactive content for the Getting Started page
 *
 * Handles clipboard copy interactions for setup commands
 * and displays the step-by-step MCP server setup guide.
 */
'use client'

import { useState } from 'react'
import { getMcpServerUrl, getMcpCommand } from '@/lib/utils/config'

const MCP_SERVER_URL = getMcpServerUrl()

/**
 * Interactive getting started content with copy-to-clipboard functionality
 */
export function GettingStartedContent() {
  const [copiedStep, setCopiedStep] = useState<string | null>(null)

  async function copyToClipboard(text: string, stepId: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    setCopiedStep(stepId)
    setTimeout(() => setCopiedStep(null), 2000)
  }

  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-medium text-[var(--text-primary)] mb-3">
          GPTers MCP 빠른 설정
        </h1>
        <p className="text-[var(--text-secondary)]">
          2단계로 Claude Code에서 GPTers 플러그인을 사용할 수 있습니다.
        </p>
      </div>

      {/* Setup Steps */}
      <div className="space-y-6">
        {/* Step 1: CLI Command */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30">
              1
            </div>
            <div className="flex-grow">
              <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                MCP 서버 추가
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                터미널에서 아래 명령어를 실행하세요:
              </p>

              <div className="relative">
                <pre className="p-4 pr-20 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-sm font-mono overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap break-all">
                  {getMcpCommand()}
                </pre>
                <button
                  onClick={() => copyToClipboard(getMcpCommand(), 'cli')}
                  className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    copiedStep === 'cli'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {copiedStep === 'cli' ? '복사됨!' : '복사'}
                </button>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="text-xs text-blue-400/90">
                  <strong>참고:</strong> 프로젝트별로 설정하려면 프로젝트 루트 디렉토리에서 실행하세요.
                  글로벌 설정은 <code>-s user</code> 옵션을 추가하세요.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Browser Login */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30">
              2
            </div>
            <div className="flex-grow">
              <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                브라우저 로그인
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Claude Code가 자동으로 브라우저를 열어 Google 로그인을 요청합니다.
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                    1
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">
                    브라우저가 자동으로 열립니다
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                    2
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">
                    Google 계정 (@gpters.org)으로 로그인
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400">
                    ✓
                  </div>
                  <span className="text-sm text-[var(--text-secondary)]">
                    완료! Claude Code로 돌아가서 사용하세요
                  </span>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="text-xs text-green-400/90">
                  <strong>보안:</strong> OAuth 2.1 인증으로 토큰을 직접 복사하거나 환경변수를 설정할 필요가 없습니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Connection Check */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-green-500/20 text-green-400 border border-green-500/30">
              ✓
            </div>
            <div className="flex-grow">
              <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                연결 확인
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                설정이 완료되면 아래 명령어로 연결 상태를 확인할 수 있습니다:
              </p>

              <div className="relative">
                <pre className="p-4 pr-20 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-sm font-mono overflow-x-auto text-[var(--text-primary)]">
                  claude mcp list
                </pre>
                <button
                  onClick={() => copyToClipboard('claude mcp list', 'check')}
                  className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    copiedStep === 'check'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {copiedStep === 'check' ? '복사됨!' : '복사'}
                </button>
              </div>

              <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                <div className="text-xs font-mono text-[var(--text-muted)]">
                  gpters-ai-toolkit: {MCP_SERVER_URL} <span className="text-green-400">✓ Connected</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Guide */}
      <div className="mt-8 p-6 rounded-2xl bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">
          🎉 설정 완료 후 사용법
        </h3>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)] mb-2">자연어로 사용</div>
            <div className="text-sm text-[var(--text-secondary)] space-y-1">
              <p>&quot;코드 리뷰해줘&quot;</p>
              <p>&quot;DB 스키마 알려줘&quot;</p>
              <p>&quot;리팩토링 가이드 참고해서 개선해줘&quot;</p>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)] mb-2">직접 호출</div>
            <div className="text-sm text-[var(--text-secondary)] font-mono space-y-1">
              <p>/mcp__gpters-ai-toolkit__code-reviewer</p>
              <p>/mcp__gpters-ai-toolkit__data-source-reference</p>
              <p>/mcp__gpters-ai-toolkit__refactor-guide</p>
            </div>
          </div>
        </div>
      </div>

      {/* Help Link */}
      <div className="mt-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          문제가 있나요?{' '}
          <a href="https://github.com/chat-prompt/gpters-ai-toolkit/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-cyan)] hover:underline">
            이슈 등록
          </a>
        </p>
      </div>
    </>
  )
}
