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
type TabId = 'claude-code' | 'opencode' | 'codex' | 'mcp'

/** Tab IDs only visible to internal (@gpters.org) users */
const INTERNAL_ONLY_TABS: Set<TabId> = new Set(['opencode', 'codex'])

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
            ? 'bg-green-500/20 text-green-400'
            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
        }`}
      >
        {copiedStep === stepId ? copiedLabel : copyLabel}
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
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={1} color="cyan" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {t('steps.pluginInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.pluginInstallDesc')}
            </p>

            <CodeBlock code={installCmd} stepId="cc-install" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox color="blue" label={t('noteLabels.note')}>
              {t('notes.pluginNote')}
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
              {t('steps.browserLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.browserLoginDesc')}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                  1
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.browserOpens')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                  2
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.googleLogin')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400">
                  ✓
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.done')}
                </span>
              </div>
            </div>

            <InfoBox color="green" label={t('noteLabels.security')}>
              {t('notes.oauthSecurity')}
            </InfoBox>

            <InfoBox color="blue" label={t('noteLabels.note')}>
              {t('notes.browserFallback')}
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
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.connectionCheckDesc')}
            </p>

            <CodeBlock code="claude mcp list" stepId="cc-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

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
function OpenCodeTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')
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
              {t('steps.pluginInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.openCodeInstallDesc')}
            </p>

            <CodeBlock code={installCmd} stepId="oc-install" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox color="blue" label={t('noteLabels.note')}>
              {t('notes.safeRerun')}
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
              {t('steps.restart')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.restartDesc')}
            </p>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400">
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
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step="✓" color="green" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.openCodeCheckDesc')}
            </p>

            <CodeBlock code="/mcp" stepId="oc-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

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
 * Codex CLI plugin tab content
 */
function CodexTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')
  const installCmd = `grep -q "verdaccio.gpters.org" ~/.npmrc 2>/dev/null || echo '@gpters-internal:registry=https://verdaccio.gpters.org
//verdaccio.gpters.org/:_authToken=Njg2NmMxZDYxZjBjMWVkMmRmZDI2Y2ZlMjMyZWRmOWM6ZTg1MWUyYzhiMGUxNjhkMmM5ODMwM2MxOTJiZTk3YWI2YTVlMzA5ZWM5YWM4YTJiMzY5YjI1NGQ=' >> ~/.npmrc && \\
npx --yes @gpters-internal/codex-plugin setup`

  return (
    <div className="space-y-6">
      {/* Step 1: Setup Command */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={1} color="cyan" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {t('steps.pluginInstall')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.pluginInstallDesc')}{' '}
              <code className="text-xs">~/.codex/config.toml</code>
              {t('notes.codexAutoConfigSuffix')}
            </p>

            <CodeBlock code={installCmd} stepId="codex-install" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox color="blue" label={t('noteLabels.note')}>
              {t('notes.safeRerun')}
            </InfoBox>
          </div>
        </div>
      </div>

      {/* Step 2: OAuth Login */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={2} color="purple" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {t('steps.oauthLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.oauthLoginDesc')}
            </p>

            <CodeBlock code="codex mcp login gpters-ai-toolkit" stepId="codex-login" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <div className="space-y-3 mt-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                  1
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.browserOpens')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                  2
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.googleLogin')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400">
                  ✓
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.authComplete')}
                </span>
              </div>
            </div>

            <InfoBox color="green" label={t('noteLabels.security')}>
              {t('notes.oauthAuto')}
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
 * MCP direct connection tab content (existing guide)
 */
function McpDirectTab({ copiedStep, onCopy, copyLabel, copiedLabel }: TabContentProps) {
  const t = useTranslations('getting-started')

  return (
    <div className="space-y-6">
      {/* Step 1: CLI Command */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <StepBadge step={1} color="cyan" />
          <div className="flex-grow">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {t('steps.mcpAdd')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.mcpAddDesc')}
            </p>

            <CodeBlock code={getMcpCommand()} stepId="mcp-cli" copiedStep={copiedStep} onCopy={onCopy} copyLabel={copyLabel} copiedLabel={copiedLabel} />

            <InfoBox color="blue" label={t('noteLabels.note')}>
              {t('notes.projectScope')}
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
              {t('steps.browserLogin')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.browserLoginDesc')}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                  1
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.browserOpens')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-cyan)]/20 flex items-center justify-center text-xs text-[var(--accent-cyan)]">
                  2
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.googleLogin')}
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs text-green-400">
                  ✓
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t('loginSteps.done')}
                </span>
              </div>
            </div>

            <InfoBox color="green" label={t('noteLabels.security')}>
              {t('notes.oauthSecurity')}
            </InfoBox>

            <InfoBox color="blue" label={t('noteLabels.note')}>
              {t('notes.browserFallback')}
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
              {t('steps.connectionCheck')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('steps.connectionCheckDesc')}
            </p>

            <CodeBlock code="claude mcp list" stepId="mcp-check" copiedStep={copiedStep} onCopy={onCopy} wrap={false} copyLabel={copyLabel} copiedLabel={copiedLabel} />

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
      {/* Page Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-medium text-[var(--text-primary)] mb-3">
          {t('pageTitle')}
        </h1>
        <p className="text-[var(--text-secondary)]">
          {t('pageSubtitle')}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-8">
        {tabs.map((tab) => (
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
      {activeTab === 'claude-code' && <ClaudeCodeTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'opencode' && <OpenCodeTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'codex' && <CodexTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}
      {activeTab === 'mcp' && <McpDirectTab copiedStep={copiedStep} onCopy={copyToClipboard} copyLabel={copyLabel} copiedLabel={copiedLabel} />}

      {/* Usage Guide */}
      <div className="mt-8 p-6 rounded-2xl bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">
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
      <div className="mt-8 p-6 rounded-2xl bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)]">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-3">
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
          <Link href="/privacy" className="text-[var(--accent-cyan)] hover:underline">
            {t('privacy.privacyLink')}
          </Link>
          {t('privacy.privacySuffix')}
        </p>
      </div>

      {/* Help Link */}
      <div className="mt-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          {t('help.question')}{' '}
          <a href="https://github.com/chat-prompt/gpters-ai-toolkit/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-cyan)] hover:underline">
            {t('help.reportIssue')}
          </a>
        </p>
      </div>
    </>
  )
}
