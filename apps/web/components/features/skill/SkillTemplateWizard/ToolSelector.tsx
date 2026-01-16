/**
 * Tool selector component for wizard
 *
 * Grid of selectable Claude Code tools with toggle selection,
 * recommended tool indicators, and tool descriptions.
 */
import { CLAUDE_TOOLS, ClaudeTool } from '@/lib/data/type-config'
import type { TemplateCategoryInfo } from './types'

/** Props for ToolSelector component */
interface ToolSelectorProps {
  /** Currently selected tool list */
  selectedTools: ClaudeTool[]
  /** Handler for toggling tool selection */
  onToolToggle: (tool: ClaudeTool) => void
  /** Handler to clear all tool selections */
  onClearAll: () => void
  /** Handler to reset to category recommended tools */
  onResetToRecommended: () => void
  /** Category info for recommended tool indicators */
  categoryInfo: TemplateCategoryInfo | null
}

/**
 * Claude tool selection grid
 *
 * Displays all available Claude tools with toggle selection,
 * recommended badges, and quick action buttons.
 */
export function ToolSelector({
  selectedTools,
  onToolToggle,
  onClearAll,
  onResetToRecommended,
  categoryInfo,
}: ToolSelectorProps) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">도구 선택</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        스킬이 사용할 수 있는 Claude Code 도구를 선택하세요. 비워두면 모든 도구를 사용할 수
        있습니다.
      </p>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-[var(--text-muted)]">
            선택된 도구: {selectedTools.length}개
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClearAll}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              전체 해제
            </button>
            <span className="text-[var(--text-muted)]">|</span>
            <button
              onClick={onResetToRecommended}
              className="text-xs text-[var(--accent-cyan)] hover:underline"
            >
              권장 도구만
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {CLAUDE_TOOLS.map((tool) => {
            const isRecommended = categoryInfo?.recommendedTools.includes(tool)
            const isSelected = selectedTools.includes(tool)

            return (
              <button
                key={tool}
                onClick={() => onToolToggle(tool)}
                className={`p-3 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-[var(--accent-cyan)]/10 border-2 border-[var(--accent-cyan)]'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{tool}</span>
                  {isSelected && <span className="text-[var(--accent-cyan)]">✓</span>}
                </div>
                {isRecommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
                    권장
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">도구 설명</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
          <div>
            <strong>Read</strong>: 파일 읽기
          </div>
          <div>
            <strong>Write</strong>: 파일 쓰기
          </div>
          <div>
            <strong>Edit</strong>: 파일 수정
          </div>
          <div>
            <strong>Glob</strong>: 파일 패턴 검색
          </div>
          <div>
            <strong>Grep</strong>: 텍스트 검색
          </div>
          <div>
            <strong>Bash</strong>: 셸 명령 실행
          </div>
          <div>
            <strong>Task</strong>: 서브에이전트 호출
          </div>
          <div>
            <strong>WebFetch</strong>: 웹 페이지 가져오기
          </div>
          <div>
            <strong>WebSearch</strong>: 웹 검색
          </div>
          <div>
            <strong>TodoWrite</strong>: 할 일 관리
          </div>
        </div>
      </div>
    </div>
  )
}
