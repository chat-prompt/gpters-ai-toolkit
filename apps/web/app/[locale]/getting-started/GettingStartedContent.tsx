/**
 * Client-side interactive content for the Getting Started page
 *
 * Provides tabbed setup guides for Claude Code plugin, OpenCode plugin,
 * Codex CLI plugin, and direct MCP server connection with clipboard copy interactions.
 */
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { getMcpServerUrl, getMcpCommand } from '@/lib/utils/config'

const MCP_SERVER_URL = getMcpServerUrl()

/** Tab identifier type */
type TabId = 'claude-code' | 'opencode' | 'codex' | 'cli' | 'mcp'

/** Tab IDs only visible to internal (@gpters.org) users — currently none */
const INTERNAL_ONLY_TABS: Set<TabId> = new Set()

/**
 * 단계 표식
 *
 * 단계마다 색을 달리 칠하던 방식은 걷어냈다 — 순서는 숫자가 이미 말해 준다.
 *
 * @param step - 단계 번호 또는 완료 표시
 */
function StepBadge({ step }: { step: string | number }) {
  return (
    <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] font-mono text-sm tabular-nums text-[var(--text-secondary)]">
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
 * @param copyLabel - Label for copy button
 * @param copiedLabel - Label shown after copying
 */
function CodeBlock({
  code,
  stepId,
  copiedStep,
  onCopy,
  wrap = true,
  copyLabel,
  copiedLabel,
}: {
  code: string
  stepId: string
  copiedStep: string | null
  onCopy: (text: string, stepId: string) => void
  wrap?: boolean
  copyLabel: string
  copiedLabel: string
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
            ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
        }`}
      >
        {copiedStep === stepId ? copiedLabel : copyLabel}
      </button>
    </div>
  )
}

/**
 * 참고·주의 문구
 *
 * @param label - 굵게 붙는 머리말
 * @param children - 문구 본문
 */
function InfoBox({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <p className="mt-4 border-l-2 border-[var(--border-hover)] pl-3 text-xs leading-relaxed text-[var(--text-secondary)]">
      <strong className="font-medium text-[var(--text-primary)]">{label}</strong> {children}
    </p>
  )
}

/**
 * Props shared by all tab content components
 */
interface TabContentProps {
  /** Currently copied step ID */
  copiedStep: string | null
  /** Copy handler function */
  onCopy: (text: string, stepId: string) => void
  /** Label for copy button */
  copyLabel: string
  /** Label shown after copying */
  copiedLabel: string
}

/**
 * Claude Code plugin tab content
 */
function ClaudeCodeTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')
  const installCmd = 'claude plugin marketplace add chat-prompt/gpters-ai-toolkit 2>/dev/null; claude mcp remove gpters-ai-toolkit 2>/dev/null; claude plugin install gpters-ai-toolkit'

  return (
    <div className="space-y-6">
      {/* Step 1: Plugin Install */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={1} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.pluginInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.pluginInstallDesc')}
            </p>

            <CodeBlock code={installCmd} stepId="cc-install" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.pluginNote')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: Browser Login */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={2} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.browserLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.browserLoginDesc')}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  1
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.browserOpens')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  2
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.googleLogin')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  ✓
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.done')}
                </span>
              </div>
            </div>

            <InfoBox label={t('noteLabels.security')}>
              {t('notes.oauthSecurity')}
            </InfoBox>

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.browserFallback')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.connectionCheckDesc')}
            </p>

            <CodeBlock code="claude mcp list" stepId="cc-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                gpters-ai-toolkit: {MCP_SERVER_URL} <span className="text-[var(--text-secondary)]">✓ Connected</span>
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
function OpenCodeTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')
  const installCmd = `[ ! -f ~/.config/opencode/opencode.json ] && echo '{"$schema":"https://opencode.ai/config.json","plugin":[]}' > ~/.config/opencode/opencode.json; \\
node -e "const fs=require('fs'),f=process.env.HOME+'/.config/opencode/opencode.json',c=JSON.parse(fs.readFileSync(f,'utf8'));c.plugin=c.plugin||[];c.plugin.includes('@gpters/opencode')||c.plugin.push('@gpters/opencode@latest');fs.writeFileSync(f,JSON.stringify(c,null,2))"`

  return (
    <div className="space-y-6">
      {/* Step 1: One-liner Install */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={1} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.pluginInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.openCodeInstallDesc')}
            </p>

            <CodeBlock code={installCmd} stepId="oc-install" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.safeRerun')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: Restart */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={2} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.restart')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.restartDesc')}
            </p>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                ✓
              </div>
              <span className="text-sm text-[var(--text-secondary)]">
                {t('loginSteps.restartDone')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.openCodeCheckDesc')}
            </p>

            <CodeBlock code="/mcp" stepId="oc-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                gpters-ai-toolkit <span className="text-[var(--text-secondary)]">✓ Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Codex CLI plugin tab content
 */
function CodexTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')
  const installCmd = `npx --yes @gpters/codex-plugin setup`

  return (
    <div className="space-y-6">
      {/* Step 1: Setup Command */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={1} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.pluginInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.pluginInstallDesc')}{' '}
              <code className="text-xs">~/.codex/config.toml</code>
              {t('notes.codexAutoConfigSuffix')}
            </p>

            <CodeBlock code={installCmd} stepId="codex-install" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.safeRerun')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: OAuth Login */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={2} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.oauthLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.oauthLoginDesc')}
            </p>

            <CodeBlock code="codex mcp login gpters-ai-toolkit" stepId="codex-login" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <div className="space-y-3 mt-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  1
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.browserOpens')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  2
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.googleLogin')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  ✓
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.authComplete')}
                </span>
              </div>
            </div>

            <InfoBox label={t('noteLabels.security')}>
              {t('notes.oauthAuto')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.codexCheckDesc')}{' '}
              <code className="text-xs ml-1">~/.codex/config.toml</code>
              {t('steps.codexCheckDescSuffix')}
            </p>

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                <div>[mcp_servers.gpters-ai-toolkit]</div>
                <div>type = &quot;http&quot;</div>
                <div>url = &quot;{MCP_SERVER_URL}&quot;</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * AITK CLI tab content
 */
function CliTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')

  return (
    <div className="space-y-6">
      {/* Step 1: Install */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={1} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.cliInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.cliInstallDesc')}
            </p>

            <CodeBlock code="npm install -g @gpters/aitk" stepId="cli-install" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />
          </div>
        </div>
      </div>

      {/* Step 2: Login */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={2} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.cliLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.cliLoginDesc')}
            </p>

            <CodeBlock code="aitk login" stepId="cli-login" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.cliNote')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 3: Usage */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={3} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.cliUsage')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.cliUsageDesc')}
            </p>

            <CodeBlock code={'aitk search "code review"\naitk get code-reviewer'} stepId="cli-usage" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * MCP direct connection tab content (existing guide)
 */
function McpDirectTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')

  return (
    <div className="space-y-6">
      {/* Step 1: CLI Command */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={1} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.mcpAdd')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.mcpAddDesc')}
            </p>

            <CodeBlock code={getMcpCommand()} stepId="mcp-cli" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.projectScope')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: Browser Login */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step={2} />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.browserLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.browserLoginDesc')}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  1
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.browserOpens')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  2
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.googleLogin')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                  ✓
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.done')}
                </span>
              </div>
            </div>

            <InfoBox label={t('noteLabels.security')}>
              {t('notes.oauthSecurity')}
            </InfoBox>

            <InfoBox label={t('noteLabels.note')}>
              {t('notes.browserFallback')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Connection Check */}
      <div className="surface-card">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" />
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.connectionCheckDesc')}
            </p>

            <CodeBlock code="claude mcp list" stepId="mcp-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs font-mono text-[var(--text-muted)]">
                gpters-ai-toolkit: {MCP_SERVER_URL} <span className="text-[var(--text-secondary)]">✓ Connected</span>
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
 * Provides installation methods filtered by user type.
 * Internal users see all options; external users see only Claude Code and MCP direct.
 *
 * @param isInternal - Whether the user belongs to the internal organization
 */
export function GettingStartedContent({ isInternal }: { isInternal: boolean }) {
  const t = useTranslations('getting-started')
  const [activeTab, setActiveTab] = useState<TabId>('claude-code')
  const [copiedStep, setCopiedStep] = useState<string | null>(null)

  /** Tab definition with translated labels */
  interface Tab {
    /** Tab identifier */
    id: TabId
    /** Display label */
    label: string
    /** Short description shown below label */
    description: string
  }

  const ALL_TABS: Tab[] = [
    { id: 'claude-code', label: t('tabs.claudeCode.label'), description: t('tabs.claudeCode.description') },
    { id: 'opencode', label: t('tabs.opencode.label'), description: t('tabs.opencode.description') },
    { id: 'codex', label: t('tabs.codex.label'), description: t('tabs.codex.description') },
    { id: 'cli', label: t('tabs.cli.label'), description: t('tabs.cli.description') },
    { id: 'mcp', label: t('tabs.mcp.label'), description: t('tabs.mcp.description') },
  ]

  const tabs = isInternal ? ALL_TABS : ALL_TABS.filter(tab => !INTERNAL_ONLY_TABS.has(tab.id))

  const copyLabel = t('copy')
  const copiedLabel = t('copied')

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
      {/* 페이지 머리글 — 왼쪽 정렬 */}
      <header className="reveal mb-10">
        <h1 className="page-title">{t('pageTitle')}</h1>
        <p className="page-subtitle">{t('pageSubtitle')}</p>
      </header>

      {/* Quick Start */}
      <div className="surface-card mb-8">
        <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-2">
          {t('quickStart.title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {t('quickStart.description')}
        </p>
        <CodeBlock
          code={t('quickStart.command')}
          stepId="quick-start"
          copiedStep={copiedStep}
          onCopy={copyToClipboard}
          wrap={false}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
        <InfoBox label={t('noteLabels.note')}>
          {t('quickStart.note')}
        </InfoBox>
      </div>

      {/* Separator */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 h-px bg-[var(--border-subtle)]" />
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{t('orSeparator')}</span>
        <div className="flex-1 h-px bg-[var(--border-subtle)]" />
      </div>

      {/* Tab Navigation */}
      <div className="mb-8 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`min-w-[9rem] flex-1 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-[var(--border-hover)] bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <div>{tab.label}</div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">
              {tab.description}
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'claude-code' && <ClaudeCodeTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'opencode' && <OpenCodeTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'codex' && <CodexTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'cli' && <CliTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'mcp' && <McpDirectTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}

      {/* Usage Guide */}
      <div className="surface-card mt-8">
        <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">
          {t('usageGuide.title')}
        </h3>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)] mb-2">{t('usageGuide.naturalLanguage')}</div>
            <div className="text-sm text-[var(--text-secondary)] space-y-1">
              <p>&quot;{t('usageGuide.example1')}&quot;</p>
              <p>&quot;{t('usageGuide.example2')}&quot;</p>
              <p>&quot;{t('usageGuide.example3')}&quot;</p>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)] mb-2">{t('usageGuide.directCall')}</div>
            <div className="text-sm text-[var(--text-secondary)] font-mono space-y-1">
              <p>/mcp__gpters-ai-toolkit__code-reviewer</p>
              <p>/mcp__gpters-ai-toolkit__data-source-reference</p>
              <p>/mcp__gpters-ai-toolkit__refactor-guide</p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Opt-Out */}
      <div className="surface-card mt-8">
        <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-3">
          {t('privacy.title')}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          {t('privacy.description')}
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {t('privacy.optOutDesc')}{' '}
          <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-xs font-mono">X-Analytics-Opt-Out: true</code>
          {' '}{t('privacy.optOutDescSuffix')}
        </p>

        {activeTab === 'claude-code' || activeTab === 'mcp' ? (
          <CodeBlock
            code={`# Claude Code settings.json에 headers 추가\n{\n  "mcpServers": {\n    "gpters-ai-toolkit": {\n      "headers": { "X-Analytics-Opt-Out": "true" }\n    }\n  }\n}`}
            stepId="optout-claude"
            copiedStep={copiedStep}
            onCopy={copyToClipboard}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        ) : activeTab === 'codex' ? (
          <CodeBlock
            code={`# ~/.codex/config.toml에 headers 추가\n[mcp_servers.gpters-ai-toolkit]\ntype = "http"\nurl = "${MCP_SERVER_URL}"\n\n[mcp_servers.gpters-ai-toolkit.headers]\nX-Analytics-Opt-Out = "true"`}
            stepId="optout-codex"
            copiedStep={copiedStep}
            onCopy={copyToClipboard}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        ) : (
          <CodeBlock
            code={`# opencode.json에 headers 추가\n{\n  "mcp": {\n    "gpters-ai-toolkit": {\n      "headers": { "X-Analytics-Opt-Out": "true" }\n    }\n  }\n}`}
            stepId="optout-opencode"
            copiedStep={copiedStep}
            onCopy={copyToClipboard}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        )}

        <p className="text-xs text-[var(--text-muted)] mt-3">
          {t('privacy.seeAlsoPrefix')}{' '}
          <Link href="/privacy" className="text-[var(--brand-primary)] hover:underline">
            {t('privacy.privacyLink')}
          </Link>
          {t('privacy.privacySuffix')}
        </p>
      </div>

      {/* Help Link */}
      <div className="mt-8">
        <p className="text-sm text-[var(--text-muted)]">
          {t('help.question')}{' '}
          <a href="https://github.com/chat-prompt/gpters-ai-toolkit/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--brand-primary)] hover:underline">
            {t('help.reportIssue')}
          </a>
        </p>
      </div>
    </>
  )
}
