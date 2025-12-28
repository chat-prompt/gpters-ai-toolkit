'use client'

import { useState, useCallback, useMemo } from 'react'
import { CopyButton } from './CopyButton'
import { CLAUDE_TOOLS, ClaudeTool } from '@/lib/type-config'

// Template categories
export type TemplateCategory =
  | 'data-reference'
  | 'workflow-automation'
  | 'code-analysis'
  | 'documentation'
  | 'testing'

interface TemplateCategoryInfo {
  id: TemplateCategory
  name: string
  description: string
  icon: string
  gradient: string
  recommendedTools: ClaudeTool[]
  bestPractices: string[]
  exampleDescription: string
}

const TEMPLATE_CATEGORIES: TemplateCategoryInfo[] = [
  {
    id: 'data-reference',
    name: '데이터 참조',
    description: '데이터베이스, API, 외부 소스에서 정보를 가져와 활용하는 스킬',
    icon: '📊',
    gradient: 'from-cyan-400 to-blue-500',
    recommendedTools: ['Read', 'Grep', 'Glob', 'WebFetch', 'Bash'],
    bestPractices: [
      '읽기 전용 도구만 허용하여 안전성 확보',
      '캐싱 전략을 명시하여 성능 최적화',
      '데이터 형식과 스키마를 명확히 문서화',
      '에러 핸들링 시나리오 포함',
    ],
    exampleDescription: 'SQL 데이터베이스 스키마를 참조하여 쿼리 작성을 돕습니다',
  },
  {
    id: 'workflow-automation',
    name: '워크플로우 자동화',
    description: '반복적인 작업을 자동화하고 효율성을 높이는 스킬',
    icon: '🔄',
    gradient: 'from-purple-400 to-pink-500',
    recommendedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Task'],
    bestPractices: [
      '작업 전 현재 상태 확인 단계 포함',
      '중간 결과 검증 로직 추가',
      '롤백 가능한 단계별 실행',
      '진행 상황 보고 기능 포함',
    ],
    exampleDescription: 'Git 커밋 메시지 작성 및 PR 생성을 자동화합니다',
  },
  {
    id: 'code-analysis',
    name: '코드 분석',
    description: '코드 품질, 보안, 성능을 분석하고 개선점을 제안하는 스킬',
    icon: '🔍',
    gradient: 'from-emerald-400 to-teal-500',
    recommendedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    bestPractices: [
      '분석 범위와 기준을 명확히 정의',
      '결과를 구조화된 형식으로 출력',
      '우선순위가 있는 개선 제안 제공',
      '코드 수정은 별도 확인 후 실행',
    ],
    exampleDescription: '코드베이스의 잠재적 버그와 개선점을 분석합니다',
  },
  {
    id: 'documentation',
    name: '문서화',
    description: '코드, API, 프로젝트 문서를 생성하고 관리하는 스킬',
    icon: '📝',
    gradient: 'from-amber-400 to-orange-500',
    recommendedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    bestPractices: [
      '기존 문서 스타일 분석 후 일관성 유지',
      '마크다운 포맷 표준 준수',
      '예제 코드와 사용법 포함',
      '버전 정보와 업데이트 이력 관리',
    ],
    exampleDescription: '함수와 클래스의 JSDoc/TSDoc 주석을 자동 생성합니다',
  },
  {
    id: 'testing',
    name: '테스트',
    description: '테스트 코드 생성, 실행, 커버리지 분석을 지원하는 스킬',
    icon: '🧪',
    gradient: 'from-rose-400 to-red-500',
    recommendedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'],
    bestPractices: [
      '테스트 프레임워크 자동 감지',
      '엣지 케이스와 경계값 테스트 포함',
      '모킹 전략 명시',
      '테스트 실행 결과 요약 제공',
    ],
    exampleDescription: '기존 코드에 대한 단위 테스트를 자동 생성합니다',
  },
]

// Wizard steps
const WIZARD_STEPS = [
  { id: 'category', label: '템플릿 선택', description: '스킬 유형 선택' },
  { id: 'basic', label: '기본 정보', description: '이름과 설명 입력' },
  { id: 'tools', label: '도구 선택', description: '사용 도구 설정' },
  { id: 'preview', label: '미리보기', description: '코드 확인 및 복사' },
]

interface SkillTemplateWizardProps {
  onComplete?: (template: GeneratedTemplate) => void
  initialCategory?: TemplateCategory
}

export interface GeneratedTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  allowedTools: string[]
  content: string
}

export function SkillTemplateWizard({ onComplete, initialCategory }: SkillTemplateWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialCategory ? 1 : 0)
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(
    initialCategory || null
  )
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [selectedTools, setSelectedTools] = useState<ClaudeTool[]>([])
  const [customId, setCustomId] = useState('')

  // Get category info
  const categoryInfo = useMemo(() => {
    return TEMPLATE_CATEGORIES.find((c) => c.id === selectedCategory) || null
  }, [selectedCategory])

  // Generate skill ID from name
  const generatedId = useMemo(() => {
    if (customId) return customId
    return skillName
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)
  }, [skillName, customId])

  // Handle category selection
  const handleCategorySelect = useCallback((category: TemplateCategory) => {
    setSelectedCategory(category)
    const cat = TEMPLATE_CATEGORIES.find((c) => c.id === category)
    if (cat) {
      setSelectedTools(cat.recommendedTools)
      setSkillDescription(cat.exampleDescription)
    }
    setCurrentStep(1)
  }, [])

  // Handle tool toggle
  const handleToolToggle = useCallback((tool: ClaudeTool) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    )
  }, [])

  // Generate template content
  const generatedContent = useMemo(() => {
    if (!categoryInfo || !skillName) return ''

    const bestPracticesFormatted = categoryInfo.bestPractices
      .map((bp) => `- ${bp}`)
      .join('\n')

    switch (selectedCategory) {
      case 'data-reference':
        return `# ${skillName}

## 개요

${skillDescription || categoryInfo.exampleDescription}

## 데이터 소스

이 스킬이 참조하는 데이터 소스:

- **위치**: \`path/to/data\`
- **형식**: JSON / CSV / Database
- **업데이트 주기**: 실시간 / 일일 / 주간

## 사용 방법

### 데이터 조회

\`\`\`
특정 데이터를 찾을 때 이 스킬을 사용하세요.
\`\`\`

### 예시

**요청**: "사용자 테이블 스키마 확인"

**응답 형식**:
\`\`\`json
{
  "table": "users",
  "columns": [
    { "name": "id", "type": "integer", "nullable": false },
    { "name": "email", "type": "varchar", "nullable": false }
  ]
}
\`\`\`

## Best Practices

${bestPracticesFormatted}

## 주의사항

- 민감한 데이터는 마스킹하여 표시
- 대용량 데이터는 페이지네이션 적용
- 캐시된 데이터임을 명시할 것
`

      case 'workflow-automation':
        return `# ${skillName}

## 개요

${skillDescription || categoryInfo.exampleDescription}

## 실행 조건

이 스킬은 다음 상황에서 자동으로 활성화됩니다:

- 조건 1을 설명하세요
- 조건 2를 설명하세요

## 워크플로우

### Step 1: 현재 상태 확인

작업 전 현재 상태를 확인합니다:

\`\`\`bash
# 상태 확인 명령어
\`\`\`

### Step 2: 작업 수행

메인 작업을 수행합니다:

1. 첫 번째 작업
2. 두 번째 작업
3. 세 번째 작업

### Step 3: 결과 확인

작업 완료 후 결과를 검증합니다.

## Best Practices

${bestPracticesFormatted}

## 롤백

문제 발생 시 다음 방법으로 롤백합니다:

\`\`\`bash
# 롤백 명령어
\`\`\`

## 출력 형식

작업 완료 후 다음 정보를 요약합니다:
- 수행된 작업 목록
- 변경된 파일/리소스
- 다음 단계 제안
`

      case 'code-analysis':
        return `# ${skillName}

## 개요

${skillDescription || categoryInfo.exampleDescription}

## 분석 범위

### 포함

- 분석할 파일 패턴: \`src/**/*.ts\`
- 분석 기준 1
- 분석 기준 2

### 제외

- \`node_modules\`
- \`*.test.ts\`
- 빌드 결과물

## 분석 절차

### 1. 파일 수집

분석 대상 파일을 수집합니다:

\`\`\`bash
# Glob 패턴으로 파일 검색
\`\`\`

### 2. 패턴 분석

다음 패턴을 검사합니다:

- **버그 패턴**: 잠재적 버그가 될 수 있는 코드
- **성능 이슈**: 비효율적인 코드 패턴
- **보안 취약점**: 보안 문제가 될 수 있는 코드

### 3. 결과 정리

분석 결과를 우선순위별로 정리합니다.

## Best Practices

${bestPracticesFormatted}

## 출력 형식

\`\`\`markdown
## 분석 결과

### 🔴 Critical (즉시 수정 필요)
- [파일명:라인] 설명

### 🟡 Warning (개선 권장)
- [파일명:라인] 설명

### 🟢 Info (참고)
- [파일명:라인] 설명

### 📊 통계
- 분석 파일 수: N
- 발견된 이슈: N
\`\`\`
`

      case 'documentation':
        return `# ${skillName}

## 개요

${skillDescription || categoryInfo.exampleDescription}

## 문서화 대상

### 지원 형식

- TypeScript/JavaScript (JSDoc, TSDoc)
- Python (Docstring)
- Markdown (README, Wiki)

### 대상 요소

- 함수/메서드
- 클래스/인터페이스
- 모듈/패키지

## 문서화 절차

### 1. 기존 스타일 분석

프로젝트의 기존 문서 스타일을 분석합니다:

\`\`\`bash
# 기존 문서 패턴 검색
\`\`\`

### 2. 코드 분석

문서화할 코드를 분석합니다:

- 함수 시그니처
- 파라미터 타입과 설명
- 반환값
- 예외 처리

### 3. 문서 생성

스타일 가이드에 맞춰 문서를 생성합니다.

## Best Practices

${bestPracticesFormatted}

## 템플릿

### JSDoc 예시

\`\`\`typescript
/**
 * 함수 설명
 *
 * @param {string} param1 - 파라미터 1 설명
 * @param {number} param2 - 파라미터 2 설명
 * @returns {boolean} 반환값 설명
 * @throws {Error} 에러 발생 조건
 * @example
 * const result = myFunction('hello', 42);
 */
\`\`\`
`

      case 'testing':
        return `# ${skillName}

## 개요

${skillDescription || categoryInfo.exampleDescription}

## 지원 프레임워크

자동으로 프로젝트의 테스트 프레임워크를 감지합니다:

- **JavaScript/TypeScript**: Jest, Vitest, Mocha
- **Python**: pytest, unittest
- **기타**: 프레임워크 명시 필요

## 테스트 생성 절차

### 1. 코드 분석

테스트 대상 코드를 분석합니다:

\`\`\`bash
# 함수/클래스 시그니처 추출
\`\`\`

### 2. 테스트 케이스 도출

다음 케이스를 자동 생성합니다:

- **정상 케이스**: 기대대로 동작하는 경우
- **경계값**: 최소/최대값, 빈 값
- **예외 케이스**: 에러 발생 시나리오

### 3. 테스트 코드 생성

프레임워크에 맞는 테스트 코드를 생성합니다.

## Best Practices

${bestPracticesFormatted}

## 템플릿

### Vitest 예시

\`\`\`typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './myFunction'

describe('myFunction', () => {
  it('should return expected value for valid input', () => {
    expect(myFunction('input')).toBe('expected')
  })

  it('should handle edge cases', () => {
    expect(myFunction('')).toBe('')
    expect(myFunction(null)).toThrow()
  })

  it('should throw error for invalid input', () => {
    expect(() => myFunction(undefined)).toThrow('Invalid input')
  })
})
\`\`\`

## 실행

\`\`\`bash
# 테스트 실행
pnpm test

# 커버리지 포함
pnpm test --coverage
\`\`\`
`

      default:
        return ''
    }
  }, [categoryInfo, skillName, skillDescription, selectedCategory])

  // Generate full template object
  const fullTemplate: GeneratedTemplate = useMemo(
    () => ({
      id: generatedId,
      name: skillName,
      description: skillDescription,
      category: selectedCategory || 'data-reference',
      allowedTools: selectedTools,
      content: generatedContent,
    }),
    [generatedId, skillName, skillDescription, selectedCategory, selectedTools, generatedContent]
  )

  // Navigation handlers
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0:
        return selectedCategory !== null
      case 1:
        return skillName.trim().length > 0 && skillDescription.trim().length > 0
      case 2:
        return true // Tools are optional
      case 3:
        return true
      default:
        return false
    }
  }, [currentStep, selectedCategory, skillName, skillDescription])

  const handleNext = useCallback(() => {
    if (canProceed() && currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1)
    }
  }, [canProceed, currentStep])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  const handleComplete = useCallback(() => {
    onComplete?.(fullTemplate)
  }, [onComplete, fullTemplate])

  // Download as file
  const handleDownload = useCallback(() => {
    const blob = new Blob([generatedContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${generatedId || 'skill'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [generatedContent, generatedId])

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {WIZARD_STEPS.map((step, index) => (
          <div key={step.id} className="flex-1 flex items-center">
            <button
              onClick={() => index < currentStep && setCurrentStep(index)}
              disabled={index > currentStep}
              className="w-full flex flex-col items-center gap-2 group"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  index < currentStep
                    ? 'bg-green-500 text-white'
                    : index === currentStep
                      ? 'bg-[var(--accent-cyan)] text-black'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                }`}
              >
                {index < currentStep ? '✓' : index + 1}
              </div>
              <div className="text-center">
                <span
                  className={`text-xs font-medium block transition-colors ${
                    index === currentStep
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {step.label}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] hidden sm:block">
                  {step.description}
                </span>
              </div>
            </button>
            {index < WIZARD_STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-2 transition-colors ${
                  index < currentStep ? 'bg-green-500' : 'bg-[var(--border-subtle)]'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="glass rounded-2xl p-8 mb-6">
        {/* Step 1: Category Selection */}
        {currentStep === 0 && (
          <div className="animate-fade-up">
            <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">
              템플릿 유형 선택
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              생성할 스킬의 카테고리를 선택하세요. 각 카테고리에는 최적화된 템플릿과 권장 도구가
              포함되어 있습니다.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TEMPLATE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(category.id)}
                  className={`p-6 rounded-xl text-left transition-all ${
                    selectedCategory === category.id
                      ? 'bg-[var(--accent-cyan)]/10 border-2 border-[var(--accent-cyan)]'
                      : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`text-3xl w-12 h-12 flex items-center justify-center rounded-lg bg-gradient-to-br ${category.gradient} bg-opacity-20`}
                    >
                      {category.icon}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">
                        {category.name}
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                        {category.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {category.recommendedTools.slice(0, 4).map((tool) => (
                          <span
                            key={tool}
                            className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                          >
                            {tool}
                          </span>
                        ))}
                        {category.recommendedTools.length > 4 && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                            +{category.recommendedTools.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Basic Info */}
        {currentStep === 1 && (
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
                  onChange={(e) => setSkillName(e.target.value)}
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
                    onChange={(e) => setCustomId(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
                    placeholder={generatedId || 'auto-generated'}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  비워두면 이름에서 자동 생성됩니다: <code className="text-[var(--accent-cyan)]">{generatedId || '...'}</code>
                </p>
              </div>

              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  설명 * <span className="normal-case text-[var(--text-muted)]">(Claude 호출 트리거)</span>
                </label>
                <textarea
                  value={skillDescription}
                  onChange={(e) => setSkillDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors resize-none"
                  rows={3}
                  placeholder="예: 데이터베이스 스키마나 테이블 구조를 참조할 때 사용합니다"
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  팁: &quot;~할 때&quot;, &quot;~작업 시&quot; 같은 트리거 키워드를 포함하면 Claude가 적절한 시점에 스킬을 활성화합니다.
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
        )}

        {/* Step 3: Tool Selection */}
        {currentStep === 2 && (
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
                    onClick={() => setSelectedTools([])}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    전체 해제
                  </button>
                  <span className="text-[var(--text-muted)]">|</span>
                  <button
                    onClick={() => setSelectedTools(categoryInfo?.recommendedTools || [])}
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
                      onClick={() => handleToolToggle(tool)}
                      className={`p-3 rounded-lg text-left transition-all ${
                        isSelected
                          ? 'bg-[var(--accent-cyan)]/10 border-2 border-[var(--accent-cyan)]'
                          : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {tool}
                        </span>
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
                <div><strong>Read</strong>: 파일 읽기</div>
                <div><strong>Write</strong>: 파일 쓰기</div>
                <div><strong>Edit</strong>: 파일 수정</div>
                <div><strong>Glob</strong>: 파일 패턴 검색</div>
                <div><strong>Grep</strong>: 텍스트 검색</div>
                <div><strong>Bash</strong>: 셸 명령 실행</div>
                <div><strong>Task</strong>: 서브에이전트 호출</div>
                <div><strong>WebFetch</strong>: 웹 페이지 가져오기</div>
                <div><strong>WebSearch</strong>: 웹 검색</div>
                <div><strong>TodoWrite</strong>: 할 일 관리</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {currentStep === 3 && (
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
                <div className="text-sm text-[var(--accent-cyan)] font-mono truncate">
                  {generatedId}
                </div>
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
                    onClick={handleDownload}
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
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">
                다음 단계
              </h4>
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
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          이전
        </button>

        <div className="flex gap-3">
          {currentStep === WIZARD_STEPS.length - 1 ? (
            <button
              onClick={handleComplete}
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
            >
              완료
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
