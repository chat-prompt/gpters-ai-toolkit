/**
 * Client-side interactive content for the Getting Started page
 *
 * Provides tabbed setup guides for Claude Code plugin, OpenCode plugin,
 * and direct MCP server connection with clipboard copy interactions.
 */
'use client'

import { useState } from 'react'
import { getMcpServerUrl, getMcpCommand } from '@/lib/utils/config'

const MCP_SERVER_URL = getMcpServerUrl()

/** Tab identifier type */
type TabId = 'claude-code' | 'opencode' | 'mcp'

/** Tab definition */
interface Tab {
  /** Tab identifier */
  id: TabId
  /** Display label */
  label: string
  /** Short description shown below label */
  description: string
}

const TABS: Tab[] = [
  { id: 'claude-code', label: 'Claude Code', description: '플러그인 마켓플레이스' },
  { id: 'opencode', label: 'OpenCode', description: 'npm 레지스트리' },
  { id: 'mcp', label: 'MCP 직접 연결', description: 'claude mcp add' },
]

/**
 * Reusable step badge component
 *
 * @param step - Step number or check mark
 * @param color - Accent color name (cyan, purple, green)
 */
function StepBadge({ step, color }: { step: string | number; color: 'cyan' | 'purple' | 'green' }) {
  const colorMap = {
    cyan: 'bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30',
    purple: 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border-[var(--accent-purple)]/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
  }

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${colorMap[color]}`}>
      {step}
    </div>
  )
}

/**
 * Reusable code block with copy button
 *
 * @param code - Code text to display
 * @param stepId - Unique step identifier for copy state
 * @param copiedStep - Currently copied step ID
 * @param onCopy - Copy handler function
 * @param wrap - Whether to wrap long lines
 */
function CodeBlock({
  code,
  stepId,
  copiedStep,
  onCopy,
  wrap = true,
}: {
  code: string
  stepId: string
  copiedStep: string | null
  onCopy: (text: string, stepId: string) => void
  wrap?: boolean
}) {
  return (
    <div className="relative">
      <pre
        className={`p-4 pr-20 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-sm font-mono overflow-x-auto text-[var(--text-primary)] ${wrap ? 'whitespace-pre-wrap break-all' : ''}`}
      >
        {code}
      </pre>
      <button
        onClick={() => onCopy(code, stepId)}
        className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          copiedStep === stepId
            ? 'bg-green-500/20 text-green-400'
            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
        }`}
      >
        {copiedStep === stepId ? '복사됨!' : '복사'}
      </button>
    </div>
  )
}

/**
 * Info box component for tips and notes
 *
 * @param color - Box color theme
 * @param label - Bold label text
 * @param children - Box content
 */
function InfoBox({
  color,
  label,
  children,
}: {
  color: 'blue' | 'green'
  label: string
  children: React.ReactNode
}) {
  const colorMap = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400/90',
    green: 'bg-green-500/10 border-green-500/20 text-green-400/90',
  }

  return (
    <div className={`mt-4 p-3 rounded-lg border ${colorMap[color]}`}>
      <div className="text-xs">
        <strong>{label}</strong> {children}
      </div>
    </div>
  )
}

/**
 * Claude Code plugin tab content
 */
function ClaudeCodeTab({
  copiedStep,
  onCopy,
}: {
  copiedStep: string | null
  onCopy: (text: string, stepId: string) => void
}) {
  const installCmd = 'claude mcp remove gpters-ai-toolkit 2>/dev/null; claude plugin add chat-prompt/gpters-ai-toolkit'

  return (
    <div className="space-y-6">
      {/* Step 1: Plugin Install */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={1} color="cyan" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              플러그인 설치
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              터미널에서 아래 명령어를 실행하세요:
            </p>

            <CodeBlock code={installCmd} stepId="cc-install" copiedStep={copiedStep} onCopy={onCopy} />

            <InfoBox color="blue" label="참고:">
              기존 MCP 직접 연결이 있으면 자동으로 제거 후 플러그인을 설치합니다.
              중복 연결 없이 플러그인 방식으로 전환됩니다.
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: Browser Login */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={2} color="purple" />
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
                  Google 계정 (조직 이메일)으로 로그인
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

            <InfoBox color="green" label="보안:">
              OAuth 2.1 인증으로 토큰을 직접 복사하거나 환경변수를 설정할 필요가 없습니다.
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" color="green" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              연결 확인
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              설정이 완료되면 아래 명령어로 연결 상태를 확인할 수 있습니다:
            </p>

            <CodeBlock code="claude mcp list" stepId="cc-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} />

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                gpters-ai-toolkit: {MCP_SERVER_URL} <span className="text-green-400">✓ Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * OpenCode plugin tab content
 */
function OpenCodeTab({
  copiedStep,
  onCopy,
}: {
  copiedStep: string | null
  onCopy: (text: string, stepId: string) => void
}) {
  const installCmd = `grep -q "verdaccio.gpters.org" ~/.opencode/.npmrc 2>/dev/null || echo '@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=Njg2NmMxZDYxZjBjMWVkMmRmZDI2Y2ZlMjMyZWRmOWM6ZTg1MWUyYzhiMGUxNjhkMmM5ODMwM2MxOTJiZTk3YWI2YTVlMzA5ZWM5YWM4YTJiMzY5YjI1NGQ=' >> ~/.opencode/.npmrc && \\
grep -q "verdaccio.gpters.org" ~/.cache/opencode/.npmrc 2>/dev/null || (mkdir -p ~/.cache/opencode && echo '@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=Njg2NmMxZDYxZjBjMWVkMmRmZDI2Y2ZlMjMyZWRmOWM6ZTg1MWUyYzhiMGUxNjhkMmM5ODMwM2MxOTJiZTk3YWI2YTVlMzA5ZWM5YWM4YTJiMzY5YjI1NGQ=' >> ~/.cache/opencode/.npmrc) && \\
[ ! -f ~/.config/opencode/opencode.json ] && echo '{"$schema":"https://opencode.ai/config.json","plugin":[]}' > ~/.config/opencode/opencode.json; \\
node -e "const fs=require('fs'),f=process.env.HOME+'/.config/opencode/opencode.json',c=JSON.parse(fs.readFileSync(f,'utf8'));c.plugin=c.plugin||[];c.plugin.includes('@gpters-internal/opencode')||c.plugin.push('@gpters-internal/opencode@latest');fs.writeFileSync(f,JSON.stringify(c,null,2))"`

  return (
    <div className="space-y-6">
      {/* Step 1: One-liner Install */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={1} color="cyan" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              플러그인 설치
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              터미널에서 아래 명령어를 실행하세요. Registry 설정부터 플러그인 등록까지 한 번에 완료됩니다:
            </p>

            <CodeBlock code={installCmd} stepId="oc-install" copiedStep={copiedStep} onCopy={onCopy} />

            <InfoBox color="blue" label="참고:">
              이미 설정된 환경에서는 중복 실행해도 안전합니다. 기존 설정을 덮어쓰지 않습니다.
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: Restart */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={2} color="purple" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              OpenCode 재시작
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              설정을 적용하기 위해 OpenCode를 재시작하세요.
            </p>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400">
                ✓
              </div>
              <span className="text-sm text-[var(--text-secondary)]">
                OpenCode 종료 후 다시 실행하면 플러그인이 자동으로 로드됩니다
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" color="green" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              연결 확인
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              OpenCode에서 아래 명령어로 MCP 연결 상태를 확인하세요:
            </p>

            <CodeBlock code="/mcp" stepId="oc-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} />

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                gpters-ai-toolkit <span className="text-green-400">✓ Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * MCP direct connection tab content (existing guide)
 */
function McpDirectTab({
  copiedStep,
  onCopy,
}: {
  copiedStep: string | null
  onCopy: (text: string, stepId: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Step 1: CLI Command */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={1} color="cyan" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              MCP 서버 추가
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              터미널에서 아래 명령어를 실행하세요:
            </p>

            <CodeBlock code={getMcpCommand()} stepId="mcp-cli" copiedStep={copiedStep} onCopy={onCopy} />

            <InfoBox color="blue" label="참고:">
              프로젝트별로 설정하려면 프로젝트 루트 디렉토리에서 실행하세요.
              글로벌 설정은 <code className="text-xs">-s user</code> 옵션을 추가하세요.
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: Browser Login */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={2} color="purple" />
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
                  Google 계정 (조직 이메일)으로 로그인
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

            <InfoBox color="green" label="보안:">
              OAuth 2.1 인증으로 토큰을 직접 복사하거나 환경변수를 설정할 필요가 없습니다.
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" color="green" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              연결 확인
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              설정이 완료되면 아래 명령어로 연결 상태를 확인할 수 있습니다:
            </p>

            <CodeBlock code="claude mcp list" stepId="mcp-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} />

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                gpters-ai-toolkit: {MCP_SERVER_URL} <span className="text-green-400">✓ Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Interactive getting started content with tabbed setup guides
 *
 * Provides three installation methods: Claude Code plugin, OpenCode plugin,
 * and direct MCP server connection.
 */
export function GettingStartedContent() {
  const [activeTab, setActiveTab] = useState<TabId>('claude-code')
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
          플러그인 설치 가이드
        </h1>
        <p className="text-[var(--text-secondary)]">
          사용하는 AI 코딩 도구에 맞는 설치 방법을 선택하세요.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'glass border border-[var(--accent-cyan)]/40 text-[var(--text-primary)]'
                : 'bg-[var(--bg-tertiary)]/50 border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <div>{tab.label}</div>
            <div className={`text-xs mt-0.5 ${activeTab === tab.id ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)]'}`}>
              {tab.description}
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'claude-code' && <ClaudeCodeTab copiedStep={copiedStep} onCopy={copyToClipboard} />}
      {activeTab === 'opencode' && <OpenCodeTab copiedStep={copiedStep} onCopy={copyToClipboard} />}
      {activeTab === 'mcp' && <McpDirectTab copiedStep={copiedStep} onCopy={copyToClipboard} />}

      {/* Usage Guide */}
      <div className="mt-8 p-6 rounded-2xl bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">
          설정 완료 후 사용법
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
