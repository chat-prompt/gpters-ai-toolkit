/**
 * MCP configuration generator component
 *
 * Generates Claude Code MCP server configuration JSON based on
 * user-provided URL. Includes copy functionality and step-by-step
 * setup instructions.
 */
'use client'

import { useState, useMemo, useCallback } from 'react'
import { CopyButton } from '../../ui/CopyButton'

/** Props for MCPConfigGenerator component */
interface MCPConfigGeneratorProps {
  /** Default URL to pre-populate the input field */
  defaultUrl?: string
}

/**
 * MCP configuration generator with setup instructions
 *
 * Generates settings.json configuration for Claude Code MCP integration.
 */
export function MCPConfigGenerator({ defaultUrl }: MCPConfigGeneratorProps) {
  const [url, setUrl] = useState(defaultUrl || '')
  const [copied, setCopied] = useState(false)

  const generatedConfig = useMemo(() => {
    const serverUrl = url.trim() || 'https://your-url/api/mcp'
    return JSON.stringify(
      {
        mcpServers: {
          'gpters-ai-toolkit': {
            type: 'http',
            url: serverUrl,
          },
        },
      },
      null,
      2
    )
  }, [url])

  const handleCopy = useCallback(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const settingsPath = '~/.claude/settings.json'

  return (
    <div className="glass rounded-2xl p-6 glow-purple">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">🔧</span>
        <h3 className="text-lg font-medium text-[var(--text-primary)]">MCP 설정 생성기</h3>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-6">
        MCP 서버 URL을 입력하면 Claude Code 설정 파일에 추가할 JSON 설정이 자동으로 생성됩니다.
      </p>

      {/* URL Input */}
      <div className="mb-6">
        <label
          htmlFor="mcp-url"
          className="block text-sm font-medium text-[var(--text-muted)] mb-2"
        >
          MCP 서버 URL
        </label>
        <input
          id="mcp-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-url/api/mcp"
          className="w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-purple)] transition-colors"
        />
      </div>

      {/* Generated Config */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-[var(--text-muted)]">
            생성된 설정
          </label>
          <div className="flex items-center gap-2">
            {copied && (
              <span className="text-xs text-green-400 animate-fade-in">복사됨!</span>
            )}
            <CopyButton text={generatedConfig} onCopy={handleCopy} />
          </div>
        </div>
        <pre className="bg-[var(--bg-primary)] rounded-xl p-4 overflow-x-auto">
          <code className="text-sm font-mono text-[var(--accent-purple)] whitespace-pre">
            {generatedConfig}
          </code>
        </pre>
      </div>

      {/* Instructions */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)]">설정 방법</h4>

        <ol className="space-y-3 text-sm text-[var(--text-secondary)]">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center text-xs font-medium">
              1
            </span>
            <div>
              <span>위의 설정을 복사하세요</span>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center text-xs font-medium">
              2
            </span>
            <div>
              <span>설정 파일을 열어주세요:</span>
              <div className="mt-2 flex items-center gap-2 bg-[var(--bg-primary)] rounded-lg p-2">
                <code className="text-[var(--accent-cyan)] text-xs font-mono">
                  {settingsPath}
                </code>
                <CopyButton text={settingsPath} />
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center text-xs font-medium">
              3
            </span>
            <div>
              <span>파일에 복사한 내용을 붙여넣거나, 기존 <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">mcpServers</code> 객체에 병합하세요</span>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center text-xs font-medium">
              4
            </span>
            <div>
              <span>Claude Code를 재시작하세요</span>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center text-xs font-medium">
              5
            </span>
            <div>
              <span>초기 설정을 완료하세요:</span>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-[var(--text-muted)]">
                  Claude Code에서 다음 중 하나를 실행하여 Hook과 CLAUDE.md를 설치하세요:
                </p>
                <div className="flex items-center gap-2 bg-[var(--bg-primary)] rounded-lg p-2">
                  <code className="text-[var(--accent-cyan)] text-xs font-mono">
                    &quot;설정해줘&quot;
                  </code>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  이후 작업 시 자동으로 팀 공유 플러그인 검색이 안내됩니다.
                </p>
              </div>
            </div>
          </li>
        </ol>

        <div className="mt-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">참고:</strong>{' '}
            기존에 <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">mcpServers</code> 설정이 있다면,
            <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">gpters-ai-toolkit</code> 항목만 추가하세요.
          </p>
        </div>
      </div>
    </div>
  )
}
