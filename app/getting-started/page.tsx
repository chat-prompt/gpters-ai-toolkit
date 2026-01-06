'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface TokenInfo {
  id: string
  name: string
  token?: string // Only available when just created
  expiresAt?: string | null
  createdAt: string
}

interface TokensData {
  tokens: TokenInfo[]
  count: number
  maxTokens: number
}

type Platform = 'macos' | 'linux' | 'windows'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'macos'
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'windows'
  if (platform.includes('linux')) return 'linux'
  return 'macos'
}

function getShellCommand(token: string, platform: Platform): string {
  if (platform === 'windows') {
    return `setx GPTERS_MCP_TOKEN "${token}"`
  }
  const profile = platform === 'macos' ? '~/.zshrc' : '~/.bashrc'
  return `echo 'export GPTERS_MCP_TOKEN="${token}"' >> ${profile} && source ${profile}`
}

function getMcpConfigCommand(token: string): string {
  return `cat >> ~/.claude/.mcp.json << 'EOF'
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://company-ai-toolkit.vercel.app/api/mcp?token=${token}"
    }
  }
}
EOF`
}

function getHookInstallCommand(): string {
  return `curl -fsSL https://company-ai-toolkit.vercel.app/api/hooks/gpters-plugin-suggest.sh -o ~/.claude/hooks/gpters-plugin-suggest.sh && chmod +x ~/.claude/hooks/gpters-plugin-suggest.sh`
}

function getSettingsHookConfig(): string {
  return `{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "~/.claude/hooks/gpters-plugin-suggest.sh",
        "timeout": 5000
      }
    ]
  }
}`
}

export default function GettingStartedPage() {
  const [platform, setPlatform] = useState<Platform>('macos')
  const [existingTokens, setExistingTokens] = useState<TokenInfo[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedStep, setCopiedStep] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [showHookSetup, setShowHookSetup] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/user/mcp-tokens')
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/auth/signin?callbackUrl=/getting-started'
          return
        }
        throw new Error('Failed to fetch tokens')
      }
      const data: TokensData = await res.json()
      setExistingTokens(data.tokens)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  async function createSetupToken() {
    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/user/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Setup Token (${new Date().toLocaleDateString('ko-KR')})`,
          description: 'Auto-generated for quick setup',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create token')
      }

      const data = await res.json()
      setNewToken(data.token)
      setCurrentStep(2)
      await fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token')
    } finally {
      setCreating(false)
    }
  }

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

  const tokenForCommands = newToken || 'YOUR_TOKEN_HERE'

  if (loading) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-3xl mx-auto px-8 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
          >
            <span>←</span>
            <span>Home</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-medium text-[var(--text-primary)] mb-3">
            GPTers MCP 빠른 설정
          </h1>
          <p className="text-[var(--text-secondary)]">
            3단계로 Claude Code에서 GPTers 플러그인을 사용할 수 있습니다.
          </p>
        </div>

        {/* Platform Selector */}
        <div className="glass rounded-xl p-4 mb-8">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">운영체제 선택:</span>
            <div className="flex gap-2">
              {(['macos', 'linux', 'windows'] as Platform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                    platform === p
                      ? 'bg-[var(--accent-cyan)] text-black font-medium'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {p === 'macos' ? 'macOS' : p === 'linux' ? 'Linux' : 'Windows'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Setup Steps */}
        <div className="space-y-6">
          {/* Step 1: Get Token */}
          <div className={`glass rounded-2xl p-6 transition-opacity ${currentStep >= 1 ? '' : 'opacity-50'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                newToken || existingTokens.length > 0
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30'
              }`}>
                {newToken || existingTokens.length > 0 ? '✓' : '1'}
              </div>
              <div className="flex-grow">
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  토큰 발급
                </h2>

                {newToken ? (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="text-green-400 text-sm mb-2">토큰이 생성되었습니다!</div>
                    <div className="font-mono text-xs text-[var(--text-muted)] break-all">
                      {newToken}
                    </div>
                  </div>
                ) : existingTokens.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-[var(--text-secondary)]">
                      기존 토큰이 있습니다. 새 토큰을 생성하거나{' '}
                      <Link href="/profile/tokens" className="text-[var(--accent-cyan)] hover:underline">
                        토큰 관리 페이지
                      </Link>
                      에서 확인하세요.
                    </p>
                    <button
                      onClick={createSetupToken}
                      disabled={creating}
                      className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                    >
                      {creating ? '생성 중...' : '새 토큰 생성'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-[var(--text-secondary)]">
                      Claude Code에서 MCP 서버에 접속하려면 토큰이 필요합니다.
                    </p>
                    <button
                      onClick={createSetupToken}
                      disabled={creating}
                      className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {creating ? '생성 중...' : '토큰 생성하기'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Set Environment Variable */}
          <div className={`glass rounded-2xl p-6 transition-opacity ${currentStep >= 2 || newToken ? '' : 'opacity-50'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                copiedStep === 'env'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
              }`}>
                {copiedStep === 'env' ? '✓' : '2'}
              </div>
              <div className="flex-grow">
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  터미널에서 환경변수 설정
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {platform === 'windows' ? 'PowerShell' : '터미널'}을 열고 아래 명령어를 실행하세요:
                </p>

                <div className="relative">
                  <pre className="p-4 pr-20 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-sm font-mono overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap break-all">
                    {getShellCommand(tokenForCommands, platform)}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(getShellCommand(tokenForCommands, platform), 'env')}
                    disabled={!newToken && existingTokens.length === 0}
                    className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      copiedStep === 'env'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50'
                    }`}
                  >
                    {copiedStep === 'env' ? '복사됨!' : '복사'}
                  </button>
                </div>

                {platform === 'windows' && (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    * Windows에서는 명령어 실행 후 터미널을 재시작해야 합니다.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: MCP Server Configuration */}
          <div className={`glass rounded-2xl p-6 transition-opacity ${currentStep >= 2 || newToken ? '' : 'opacity-50'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                copiedStep === 'mcp'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
              }`}>
                {copiedStep === 'mcp' ? '✓' : '3'}
              </div>
              <div className="flex-grow">
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  MCP 서버 설정
                </h2>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  터미널에서 아래 명령어를 실행하여 MCP 서버를 추가하세요:
                </p>

                <div className="relative">
                  <pre className="p-4 pr-20 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-sm font-mono overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap break-all">
                    {getMcpConfigCommand(tokenForCommands)}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(getMcpConfigCommand(tokenForCommands), 'mcp')}
                    disabled={!newToken && existingTokens.length === 0}
                    className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      copiedStep === 'mcp'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50'
                    }`}
                  >
                    {copiedStep === 'mcp' ? '복사됨!' : '복사'}
                  </button>
                </div>

                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  * 이미 .mcp.json 파일이 있다면, mcpServers 객체에 gpters-marketplace 항목만 추가하세요.
                </p>
              </div>
            </div>
          </div>

          {/* Step 4: Restart */}
          <div className={`glass rounded-2xl p-6 transition-opacity ${currentStep >= 2 || newToken ? '' : 'opacity-50'}`}>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                4
              </div>
              <div className="flex-grow">
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  Claude Code 재시작
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  설정을 적용하려면 Claude Code를 완전히 종료했다가 다시 시작하세요.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Optional: Hook Setup */}
        <div className="mt-8">
          <button
            onClick={() => setShowHookSetup(!showHookSetup)}
            className="w-full text-left glass rounded-2xl p-6 hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">⚡</span>
                <div>
                  <h3 className="text-lg font-medium text-[var(--text-primary)]">
                    선택사항: 자동 플러그인 제안 Hook
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    입력에 따라 관련 플러그인을 자동으로 제안받습니다
                  </p>
                </div>
              </div>
              <span className="text-[var(--text-muted)]">{showHookSetup ? '▲' : '▼'}</span>
            </div>
          </button>

          {showHookSetup && (
            <div className="mt-4 space-y-4 pl-4 border-l-2 border-[var(--border-subtle)]">
              {/* Hook Install */}
              <div className="glass rounded-xl p-4">
                <div className="text-sm text-[var(--text-muted)] mb-2">1. Hook 스크립트 설치</div>
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap break-all">
                    {getHookInstallCommand()}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(getHookInstallCommand(), 'hook-install')}
                    className={`absolute top-1.5 right-1.5 px-2 py-1 rounded text-xs transition-all ${
                      copiedStep === 'hook-install'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {copiedStep === 'hook-install' ? '✓' : '복사'}
                  </button>
                </div>
              </div>

              {/* Hook Config */}
              <div className="glass rounded-xl p-4">
                <div className="text-sm text-[var(--text-muted)] mb-2">2. settings.json에 hook 설정 추가</div>
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  <code className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">~/.claude/settings.json</code> 파일에 아래 내용을 추가하세요:
                </p>
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap">
                    {getSettingsHookConfig()}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(getSettingsHookConfig(), 'hook-config')}
                    className={`absolute top-1.5 right-1.5 px-2 py-1 rounded text-xs transition-all ${
                      copiedStep === 'hook-config'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {copiedStep === 'hook-config' ? '✓' : '복사'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Usage Guide */}
        {(newToken || existingTokens.length > 0) && (
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
                  <p>/mcp__gpters-marketplace__code-reviewer</p>
                  <p>/mcp__gpters-marketplace__data-source-reference</p>
                  <p>/mcp__gpters-marketplace__refactor-guide</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help Link */}
        <div className="mt-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            문제가 있나요?{' '}
            <Link href="/profile/tokens" className="text-[var(--accent-cyan)] hover:underline">
              토큰 관리
            </Link>
            {' '}또는{' '}
            <a href="https://github.com/chat-prompt/gpters-ai-toolkit/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-cyan)] hover:underline">
              이슈 등록
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
