'use client'

import { useState } from 'react'
import { CopyButton } from '../ui/CopyButton'

interface InstallGuideProps {
  itemId: string
  itemType: 'skill' | 'agent' | 'command' | 'guide' | 'hook' | 'package'
  content: string
}

export function InstallGuide({ itemId, itemType }: InstallGuideProps) {
  const [showManual, setShowManual] = useState(false)

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-toolkit.gpters.org'
  const mcpCommand = `claude mcp add gpters-ai-toolkit ${BASE_URL}/api/mcp -t http`
  const searchCommand = `gpters-ai-toolkit search_plugins("${itemId}")`
  const getCommand = `gpters-ai-toolkit get_plugin_content("${itemId}")`

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">🔌</span>
        <h3 className="text-lg font-medium text-[var(--text-primary)]">MCP로 사용하기</h3>
        <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
          권장
        </span>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-6">
        MCP 연결 후 Claude Code에서 바로 검색하여 사용하세요. 별도 설치가 필요 없습니다.
      </p>

      <div className="space-y-4">
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] flex items-center justify-center text-xs font-medium">
            1
          </span>
          <div className="flex-1">
            <span className="text-sm text-[var(--text-secondary)]">MCP 서버 연결 (최초 1회)</span>
            <div className="mt-2 flex items-center gap-2 bg-[var(--bg-primary)] rounded-lg p-2">
              <code className="text-[var(--accent-cyan)] text-xs font-mono break-all">
                {mcpCommand}
              </code>
              <CopyButton text={mcpCommand} />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] flex items-center justify-center text-xs font-medium">
            2
          </span>
          <div className="flex-1">
            <span className="text-sm text-[var(--text-secondary)]">Claude Code에서 검색</span>
            <div className="mt-2 flex items-center gap-2 bg-[var(--bg-primary)] rounded-lg p-2">
              <code className="text-[var(--accent-cyan)] text-xs font-mono break-all">
                {searchCommand}
              </code>
              <CopyButton text={searchCommand} />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] flex items-center justify-center text-xs font-medium">
            3
          </span>
          <div className="flex-1">
            <span className="text-sm text-[var(--text-secondary)]">내용 조회 후 사용</span>
            <div className="mt-2 flex items-center gap-2 bg-[var(--bg-primary)] rounded-lg p-2">
              <code className="text-[var(--accent-cyan)] text-xs font-mono break-all">
                {getCommand}
              </code>
              <CopyButton text={getCommand} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <p className="text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text-primary)]">💡 Tip:</strong>{' '}
          <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">&quot;GPTers 설정해줘&quot;</code>를 
          실행하면 Hook이 설치되어 작업 시 자동으로 관련 플러그인을 검색하도록 안내받을 수 있습니다.
        </p>
      </div>

      {['skill', 'agent', 'command'].includes(itemType) && (
        <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <span>{showManual ? '▼' : '▶'}</span>
            <span>로컬 파일로 설치하기 (대안)</span>
          </button>

          {showManual && (
            <div className="mt-4 p-4 rounded-xl bg-[var(--bg-primary)]">
              <p className="text-sm text-[var(--text-muted)] mb-3">
                MCP 대신 로컬 파일로 설치하려면 위 내용을 복사하여 다음 경로에 저장하세요:
              </p>
              <div className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-lg p-2">
                <code className="text-[var(--accent-purple)] text-xs font-mono">
                  ~/.claude/{itemType}s/{itemId}/{itemType}.md
                </code>
                <CopyButton text={`~/.claude/${itemType}s/${itemId}/${itemType}.md`} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
