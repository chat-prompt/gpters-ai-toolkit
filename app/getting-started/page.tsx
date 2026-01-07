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
type InstallScope = 'global' | 'project'

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

function getMcpConfigPath(scope: InstallScope): string {
  return scope === 'global' ? '~/.claude/.mcp.json' : '.mcp.json'
}

// CLI command to download proxy script
function getProxyDownloadCommand(): string {
  return `curl -fsSL https://company-ai-toolkit.vercel.app/api/mcp-proxy -o ~/.claude/gpters-mcp-proxy.mjs`
}

// CLI command to add MCP server (recommended - bypasses headers bug)
function getMcpCliCommand(token: string): string {
  return `claude mcp add gpters-marketplace \\
  -e MCP_URL=https://company-ai-toolkit.vercel.app/api/mcp \\
  -e MCP_TOKEN=${token} \\
  -- node ~/.claude/gpters-mcp-proxy.mjs`
}

// Legacy: JSON config (has bug - headers ignored in Claude Code v2.x)
// Keeping for reference but not used
function _getMcpConfigCommand(token: string, scope: InstallScope): string {
  const configPath = getMcpConfigPath(scope)
  return `cat > ${configPath} << 'EOF'
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://company-ai-toolkit.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}
EOF`
}

function getMcpServerSnippet(token: string): string {
  return `"gpters-marketplace": {
  "type": "stdio",
  "command": "node",
  "args": ["~/.claude/gpters-mcp-proxy.mjs"],
  "env": {
    "MCP_URL": "https://company-ai-toolkit.vercel.app/api/mcp",
    "MCP_TOKEN": "${token}"
  }
}`
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
  const [installScope, setInstallScope] = useState<InstallScope>('project')
  const [hasExistingMcpJson, setHasExistingMcpJson] = useState(false)
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

        {/* Options Selector */}
        <div className="glass rounded-xl p-4 mb-8 space-y-4">
          {/* Platform */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">운영체제:</span>
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

          {/* Install Scope */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-[var(--text-secondary)]">설치 위치:</span>
              <span className="text-xs text-[var(--text-muted)] ml-2">
                {installScope === 'project' ? '(현재 프로젝트에만 적용)' : '(모든 프로젝트에 적용)'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setInstallScope('project')}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                  installScope === 'project'
                    ? 'bg-[var(--accent-purple)] text-white font-medium'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                프로젝트
              </button>
              <button
                onClick={() => setInstallScope('global')}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                  installScope === 'global'
                    ? 'bg-[var(--accent-purple)] text-white font-medium'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                글로벌
              </button>
            </div>
          </div>

          {/* Existing .mcp.json */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-[var(--text-secondary)]">기존 .mcp.json:</span>
              <span className="text-xs text-[var(--text-muted)] ml-2">
                {hasExistingMcpJson ? '(설정 병합 가이드 표시)' : '(새 파일 생성)'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setHasExistingMcpJson(false)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                  !hasExistingMcpJson
                    ? 'bg-[var(--accent-green)] text-black font-medium'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                없음
              </button>
              <button
                onClick={() => setHasExistingMcpJson(true)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                  hasExistingMcpJson
                    ? 'bg-[var(--accent-green)] text-black font-medium'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                있음
              </button>
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
                copiedStep === 'mcp' || copiedStep === 'mcp-snippet' || copiedStep === 'mcp-cli'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
              }`}>
                {copiedStep === 'mcp' || copiedStep === 'mcp-snippet' || copiedStep === 'mcp-cli' ? '✓' : '3'}
              </div>
              <div className="flex-grow">
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  MCP 서버 설정
                </h2>

                {/* Recommended: CLI Command */}
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex items-center gap-2 text-sm text-green-400 mb-3">
                    <span>✓</span>
                    <span className="font-medium">권장: CLI 명령어 (가장 안정적)</span>
                  </div>

                  {/* Step 3-1: Download proxy script */}
                  <div className="mb-3">
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                      3-1. 프록시 스크립트 다운로드:
                    </p>
                    <div className="relative">
                      <pre className="p-2 pr-14 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-mono overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap break-all">
                        {getProxyDownloadCommand()}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(getProxyDownloadCommand(), 'proxy-download')}
                        className={`absolute top-1.5 right-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
                          copiedStep === 'proxy-download'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        {copiedStep === 'proxy-download' ? '✓' : '복사'}
                      </button>
                    </div>
                  </div>

                  {/* Step 3-2: Add MCP server */}
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                      3-2. {installScope === 'project' ? '프로젝트 루트에서' : '터미널에서'} MCP 서버 추가:
                    </p>
                    <div className="relative">
                      <pre className="p-2 pr-14 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-mono overflow-x-auto text-[var(--text-primary)] whitespace-pre-wrap break-all">
                        {getMcpCliCommand(tokenForCommands)}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(getMcpCliCommand(tokenForCommands), 'mcp-cli')}
                        disabled={!newToken && existingTokens.length === 0}
                        className={`absolute top-1.5 right-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
                          copiedStep === 'mcp-cli'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50'
                        }`}
                      >
                        {copiedStep === 'mcp-cli' ? '✓' : '복사'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Alternative: JSON Config */}
                <details className="mb-4">
                  <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                    대안: .mcp.json 직접 편집 (고급)
                  </summary>
                  <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2 text-xs mb-2">
                      <span className="text-[var(--text-muted)]">설정 파일:</span>
                      <code className="px-2 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--accent-cyan)]">
                        {getMcpConfigPath(installScope)}
                      </code>
                    </div>
                    <p className="text-xs text-yellow-400/80 mb-2">
                      ⚠️ Claude Code v2.x에서 HTTP headers 버그가 있어 권장하지 않습니다
                    </p>
                    <pre className="p-2 rounded bg-[var(--bg-secondary)] text-xs font-mono overflow-x-auto text-[var(--text-secondary)] whitespace-pre-wrap">
                      {getMcpServerSnippet(tokenForCommands)}
                    </pre>
                  </div>
                </details>

                {hasExistingMcpJson && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
                    <span className="font-medium">참고:</span> 기존 MCP 서버가 있어도 CLI 명령어로 추가하면 자동으로 병합됩니다.
                  </div>
                )}

                {/* Security tip */}
                <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="text-xs text-blue-400/90">
                    <strong>보안:</strong> CLI 명령어로 추가한 설정은 <code>~/.claude.json</code>에 저장되어 Git에 커밋되지 않습니다.
                  </div>
                </div>
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
