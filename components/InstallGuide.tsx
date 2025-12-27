'use client'

import { useState } from 'react'
import { CopyButton } from './CopyButton'

interface InstallGuideProps {
  itemId: string
  itemType: 'skill' | 'agent' | 'command'
  pluginId?: string
  content: string
  marketplaceEnabled?: boolean
}

const TYPE_PATHS: Record<string, { folder: string; file: string }> = {
  skill: { folder: 'skills', file: 'skill.md' },
  agent: { folder: 'agents', file: 'agent.md' },
  command: { folder: 'commands', file: 'command.md' },
}

const INSTALL_STEPS = [
  { id: 'copy', label: '콘텐츠 복사' },
  { id: 'folder', label: '폴더 생성' },
  { id: 'paste', label: '파일 저장' },
  { id: 'verify', label: '설치 확인' },
]

export function InstallGuide({ itemId, itemType, pluginId, content, marketplaceEnabled }: InstallGuideProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const paths = TYPE_PATHS[itemType] || TYPE_PATHS.skill
  const folderPath = `~/.claude/${paths.folder}/${itemId}/`
  const filePath = `${folderPath}${paths.file}`

  const marketplaceAddCommand = '/plugin marketplace add gpters/company-ai-toolkit'
  const marketplaceInstallCommand = `/plugin install ${itemId}@company-ai-toolkit`
  const mcpPromptCommand = `/mcp__gpters-marketplace__${itemId}`

  const handleStepComplete = (stepIndex: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev)
      next.add(stepIndex)
      return next
    })
    if (stepIndex < INSTALL_STEPS.length - 1) {
      setActiveStep(stepIndex + 1)
    }
  }

  const isAllComplete = completedSteps.size === INSTALL_STEPS.length

  return (
    <div className="space-y-6">
      {/* Marketplace Install (CLI) */}
      {marketplaceEnabled && (
        <div className="glass rounded-2xl p-6 glow-cyan">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">🔌</span>
            <h3 className="text-lg font-medium text-[var(--text-primary)]">CLI 설치</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
              추천
            </span>
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Claude Code에서 아래 명령어로 바로 설치할 수 있습니다.
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-2">1. 마켓플레이스 추가 (최초 1회)</p>
              <div className="bg-[var(--bg-primary)] rounded-xl p-4 font-mono text-sm flex items-center justify-between gap-4">
                <code className="text-[var(--accent-purple)] break-all">
                  {marketplaceAddCommand}
                </code>
                <CopyButton text={marketplaceAddCommand} />
              </div>
            </div>

            <div>
              <p className="text-xs text-[var(--text-muted)] mb-2">2. 플러그인 설치</p>
              <div className="bg-[var(--bg-primary)] rounded-xl p-4 font-mono text-sm flex items-center justify-between gap-4">
                <code className="text-[var(--accent-cyan)] break-all">
                  {marketplaceInstallCommand}
                </code>
                <CopyButton text={marketplaceInstallCommand} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MCP Prompt Usage */}
      {marketplaceEnabled && (
        <div className="glass rounded-2xl p-6 glow-purple">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">🔮</span>
            <h3 className="text-lg font-medium text-[var(--text-primary)]">MCP 프롬프트</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
              설치 없이 사용
            </span>
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-4">
            MCP 서버를 통해 설치 없이 바로 사용할 수 있습니다. Claude Code에서 다음과 같이 호출하세요.
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-2">프롬프트 호출</p>
              <div className="bg-[var(--bg-primary)] rounded-xl p-4 font-mono text-sm flex items-center justify-between gap-4">
                <code className="text-[var(--accent-purple)] break-all">
                  {mcpPromptCommand}
                </code>
                <CopyButton text={mcpPromptCommand} />
              </div>
            </div>

            <div className="text-xs text-[var(--text-muted)] p-3 rounded-lg bg-[var(--bg-secondary)]">
              <strong className="text-[var(--text-primary)]">참고:</strong> MCP 서버가 설정되어 있어야 합니다.{' '}
              <a href="/getting-started" className="text-[var(--accent-purple)] hover:underline">
                설정 방법 보기
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Quick Install (Plugin) */}
      {pluginId && (
        <div className="glass rounded-2xl p-6 glow-cyan">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">⚡</span>
            <h3 className="text-lg font-medium text-[var(--text-primary)]">빠른 설치</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
              추천
            </span>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-4 font-mono text-sm mb-4 flex items-center justify-between gap-4">
            <code className="text-[var(--accent-cyan)] break-all">
              claude plugins install {pluginId}
            </code>
            <CopyButton text={`claude plugins install ${pluginId}`} />
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            터미널에서 위 명령어를 실행하면 바로 설치됩니다.
          </p>
        </div>
      )}

      {/* Manual Install */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xl">📁</span>
          <h3 className="text-lg font-medium text-[var(--text-primary)]">수동 설치</h3>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 mb-8">
          {INSTALL_STEPS.map((step, index) => (
            <div key={step.id} className="flex-1 flex items-center">
              <button
                onClick={() => setActiveStep(index)}
                className={`w-full flex flex-col items-center gap-2 group`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    completedSteps.has(index)
                      ? 'bg-green-500 text-white'
                      : activeStep === index
                        ? 'bg-[var(--accent-cyan)] text-black'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                  }`}
                >
                  {completedSteps.has(index) ? '✓' : index + 1}
                </div>
                <span
                  className={`text-xs transition-colors ${
                    activeStep === index
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {index < INSTALL_STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 transition-colors ${
                    completedSteps.has(index)
                      ? 'bg-green-500'
                      : 'bg-[var(--border-subtle)]'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-[var(--bg-primary)] rounded-xl p-6">
          {activeStep === 0 && (
            <div className="space-y-4">
              <p className="text-[var(--text-secondary)]">
                아래 버튼을 클릭하여 콘텐츠를 클립보드에 복사하세요.
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(content)
                  handleStepComplete(0)
                }}
                className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
              >
                📋 콘텐츠 복사
              </button>
            </div>
          )}

          {activeStep === 1 && (
            <div className="space-y-4">
              <p className="text-[var(--text-secondary)]">터미널에서 다음 명령어를 실행하세요:</p>
              <div className="flex items-center justify-between gap-4 bg-[var(--bg-secondary)] rounded-lg p-3">
                <code className="text-[var(--accent-cyan)] text-sm font-mono break-all">
                  mkdir -p {folderPath}
                </code>
                <CopyButton text={`mkdir -p ${folderPath}`} />
              </div>
              <button
                onClick={() => handleStepComplete(1)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-secondary)] transition-colors"
              >
                완료 ✓
              </button>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-4">
              <p className="text-[var(--text-secondary)]">
                복사한 내용을 다음 파일에 붙여넣으세요:
              </p>
              <div className="flex items-center justify-between gap-4 bg-[var(--bg-secondary)] rounded-lg p-3">
                <code className="text-[var(--accent-cyan)] text-sm font-mono break-all">
                  {filePath}
                </code>
                <CopyButton text={filePath} />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Tip: <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">code {filePath}</code>로
                VS Code에서 바로 열 수 있습니다.
              </p>
              <button
                onClick={() => handleStepComplete(2)}
                className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-secondary)] transition-colors"
              >
                완료 ✓
              </button>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-4">
              <p className="text-[var(--text-secondary)]">설치가 완료되었는지 확인하세요:</p>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleStepComplete(3)
                      }
                    }}
                  />
                  <span className="text-[var(--text-secondary)]">
                    파일이 <code className="px-1 py-0.5 rounded bg-[var(--bg-secondary)]">{filePath}</code>에 존재함
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                  />
                  <span className="text-[var(--text-secondary)]">
                    Claude Code에서 스킬이 인식됨
                  </span>
                </label>
              </div>

              <div className="mt-4 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <p className="text-sm text-[var(--text-muted)]">
                  <strong className="text-[var(--text-primary)]">문제가 있나요?</strong>
                  <br />
                  Claude Code를 재시작하거나 <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">/refresh</code> 명령어를 실행해보세요.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Completion Message */}
        {isAllComplete && (
          <div className="mt-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
            <p className="text-green-400 font-medium">🎉 설치가 완료되었습니다!</p>
          </div>
        )}
      </div>
    </div>
  )
}
