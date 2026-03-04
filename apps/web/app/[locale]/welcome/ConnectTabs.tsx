'use client'

/**
 * 플러그인 연결 탭 컴포넌트
 *
 * Claude Code, OpenCode, Codex, AITK CLI 각각의 설치 커맨드를
 * 탭으로 전환하며 보여주는 클라이언트 컴포넌트.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'

/** 탭 식별자 */
type TabId = 'claude-code' | 'opencode' | 'codex' | 'cli'

/** 탭 정의 */
interface Tab {
  id: TabId
  label: string
  command: string
  multiline?: boolean
}

/**
 * ConnectTabs props
 */
interface ConnectTabsProps {
  /** MCP 서버 base URL */
  baseUrl: string
}

/**
 * 플러그인별 설치 커맨드를 탭으로 보여주는 컴포넌트
 *
 * @param baseUrl - MCP 서버 URL
 */
export function ConnectTabs({ baseUrl }: ConnectTabsProps) {
  const t = useTranslations('welcome')
  const [activeTab, setActiveTab] = useState<TabId>('claude-code')
  const [copied, setCopied] = useState(false)

  const tabs: Tab[] = [
    {
      id: 'claude-code',
      label: 'Claude Code',
      command: 'claude plugin marketplace add chat-prompt/gpters-ai-toolkit 2>/dev/null; claude mcp remove gpters-ai-toolkit 2>/dev/null; claude plugin install gpters-ai-toolkit',
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      command: `[ ! -f ~/.config/opencode/opencode.json ] && echo '{"$schema":"https://opencode.ai/config.json","plugin":[]}' > ~/.config/opencode/opencode.json; \\
node -e "const fs=require('fs'),f=process.env.HOME+'/.config/opencode/opencode.json',c=JSON.parse(fs.readFileSync(f,'utf8'));c.plugin=c.plugin||[];c.plugin.includes('@gpters/opencode')||c.plugin.push('@gpters/opencode@latest');fs.writeFileSync(f,JSON.stringify(c,null,2))"`,
      multiline: true,
    },
    {
      id: 'codex',
      label: 'Codex CLI',
      command: 'npx --yes @gpters/codex-plugin setup',
    },
    {
      id: 'cli',
      label: 'AITK CLI',
      command: 'npx --yes @gpters/aitk login',
    },
  ]

  const activeCommand = tabs.find((tab) => tab.id === activeTab)!

  async function handleCopy() {
    await navigator.clipboard.writeText(activeCommand.command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-[var(--bg-secondary)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setCopied(false) }}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Command box */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6">
        <p className="text-xs text-[var(--text-muted)] mb-3">{t('connect.terminalLabel')}</p>
        <div className="flex items-start gap-3">
          <pre className={`flex-1 bg-[var(--bg-secondary)] rounded-lg px-4 py-3 text-sm font-mono text-[var(--text-primary)] overflow-x-auto ${activeCommand.multiline ? 'whitespace-pre-wrap' : ''}`}>
            {activeCommand.command}
          </pre>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
