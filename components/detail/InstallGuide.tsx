/**
 * Installation guide component with step-by-step wizard
 *
 * Provides manual file installation with progress tracking.
 * MCP prompt usage is handled by QuickActionGenerator component.
 */
'use client'

import { useState, useCallback } from 'react'
import { CopyButton } from '../ui/CopyButton'
import { trackInstall } from '@/lib/features/track-install'

/**
 * Props for the InstallGuide component
 */
interface InstallGuideProps {
  /** Catalog item identifier */
  itemId: string
  /** Type of item being installed */
  itemType: 'skill' | 'agent' | 'command'
  /** Raw content to be installed */
  content: string
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

/**
 * Interactive installation wizard with MCP and manual options
 *
 * Tracks installation method usage and provides step-by-step
 * guidance for manual file setup.
 *
 * @example
 * ```tsx
 * <InstallGuide
 *   itemId="code-reviewer"
 *   itemType="skill"
 *   content={skillContent}
 * />
 * ```
 */
export function InstallGuide({ itemId, itemType, content }: InstallGuideProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const paths = TYPE_PATHS[itemType] || TYPE_PATHS.skill
  const folderPath = `~/.claude/${paths.folder}/${itemId}/`
  const filePath = `${folderPath}${paths.file}`

  // Track installation methods
  const handleTrack = useCallback((method: 'manual_content' | 'manual_folder' | 'manual_file') => {
    trackInstall(itemId, method)
  }, [itemId])

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
                  handleTrack('manual_content')
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
                <CopyButton text={`mkdir -p ${folderPath}`} onCopy={() => handleTrack('manual_folder')} />
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
                <CopyButton text={filePath} onCopy={() => handleTrack('manual_file')} />
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
  )
}
