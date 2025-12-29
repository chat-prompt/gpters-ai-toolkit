import { CopyButton } from '../../../ui/CopyButton'
import type { TemplateCategoryInfo } from './types'
import type { ClaudeTool } from '@/lib/data/type-config'

interface TemplatePreviewProps {
  categoryInfo: TemplateCategoryInfo | null
  generatedId: string
  selectedTools: ClaudeTool[]
  generatedContent: string
  onDownload: () => void
}

export function TemplatePreview({
  categoryInfo,
  generatedId,
  selectedTools,
  generatedContent,
  onDownload,
}: TemplatePreviewProps) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">미리보기</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        생성된 스킬 템플릿을 확인하고 복사하거나 다운로드하세요.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">카테고리</div>
          <div className="text-sm text-[var(--text-primary)] flex items-center gap-2">
            <span>{categoryInfo?.icon}</span>
            {categoryInfo?.name}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">스킬 ID</div>
          <div className="text-sm text-[var(--accent-cyan)] font-mono truncate">{generatedId}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">도구</div>
          <div className="text-sm text-[var(--text-primary)]">
            {selectedTools.length > 0 ? `${selectedTools.length}개` : '전체 허용'}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">설치 경로</div>
          <div className="text-sm text-[var(--text-secondary)] font-mono truncate">
            ~/.claude/skills/{generatedId}/
          </div>
        </div>
      </div>

      {/* Allowed Tools Display */}
      {selectedTools.length > 0 && (
        <div className="mb-6">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-2">허용된 도구</div>
          <div className="flex flex-wrap gap-2">
            {selectedTools.map((tool) => (
              <span
                key={tool}
                className="px-2 py-1 rounded text-xs bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-[var(--text-muted)] uppercase">skill.md</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              다운로드
            </button>
            <CopyButton text={generatedContent} />
          </div>
        </div>
        <div className="relative rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden">
          <pre className="p-4 overflow-auto max-h-[400px] text-sm text-[var(--text-secondary)] font-mono">
            <code>{generatedContent}</code>
          </pre>
        </div>
      </div>

      {/* Next Steps */}
      <div className="mt-6 p-4 rounded-lg bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/20">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">다음 단계</h4>
        <ol className="space-y-2 text-xs text-[var(--text-secondary)]">
          <li className="flex items-start gap-2">
            <span className="text-[var(--accent-cyan)] font-medium">1.</span>
            <span>
              폴더 생성:{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]">
                mkdir -p ~/.claude/skills/{generatedId}
              </code>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--accent-cyan)] font-medium">2.</span>
            <span>
              파일 저장:{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">
                ~/.claude/skills/{generatedId}/skill.md
              </code>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--accent-cyan)] font-medium">3.</span>
            <span>Claude Code에서 스킬이 인식되는지 확인</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
