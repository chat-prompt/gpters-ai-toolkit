import type { TemplateCategoryInfo } from './types'

interface BasicInfoFormProps {
  skillName: string
  onSkillNameChange: (name: string) => void
  skillDescription: string
  onSkillDescriptionChange: (description: string) => void
  customId: string
  onCustomIdChange: (id: string) => void
  generatedId: string
  categoryInfo: TemplateCategoryInfo | null
}

export function BasicInfoForm({
  skillName,
  onSkillNameChange,
  skillDescription,
  onSkillDescriptionChange,
  customId,
  onCustomIdChange,
  generatedId,
  categoryInfo,
}: BasicInfoFormProps) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">기본 정보 입력</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        스킬의 이름과 설명을 입력하세요. 설명은 Claude가 스킬을 호출할 시점을 결정하는 데
        사용됩니다.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            스킬 이름 *
          </label>
          <input
            type="text"
            value={skillName}
            onChange={(e) => onSkillNameChange(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
            placeholder="예: Database Schema Reference"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            스킬 ID
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={customId}
              onChange={(e) => onCustomIdChange(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
              placeholder={generatedId || 'auto-generated'}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            비워두면 이름에서 자동 생성됩니다:{' '}
            <code className="text-[var(--accent-cyan)]">{generatedId || '...'}</code>
          </p>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            설명 * <span className="normal-case text-[var(--text-muted)]">(Claude 호출 트리거)</span>
          </label>
          <textarea
            value={skillDescription}
            onChange={(e) => onSkillDescriptionChange(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors resize-none"
            rows={3}
            placeholder="예: 데이터베이스 스키마나 테이블 구조를 참조할 때 사용합니다"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            팁: &quot;~할 때&quot;, &quot;~작업 시&quot; 같은 트리거 키워드를 포함하면 Claude가
            적절한 시점에 스킬을 활성화합니다.
          </p>
        </div>

        {categoryInfo && (
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <span>{categoryInfo.icon}</span>
              {categoryInfo.name} Best Practices
            </h4>
            <ul className="space-y-1">
              {categoryInfo.bestPractices.map((practice, i) => (
                <li
                  key={i}
                  className="text-xs text-[var(--text-secondary)] flex items-start gap-2"
                >
                  <span className="text-[var(--accent-cyan)]">-</span>
                  {practice}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
