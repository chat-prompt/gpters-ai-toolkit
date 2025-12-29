import { useMemo } from 'react'
import type { TemplateCategory, TemplateCategoryInfo, GeneratedTemplate } from './types'
import type { ClaudeTool } from '@/lib/data/type-config'

interface UseTemplateGeneratorParams {
  categoryInfo: TemplateCategoryInfo | null
  skillName: string
  skillDescription: string
  selectedCategory: TemplateCategory | null
  selectedTools: ClaudeTool[]
  generatedId: string
}

function generateDataReferenceTemplate(
  skillName: string,
  skillDescription: string,
  categoryInfo: TemplateCategoryInfo
): string {
  const bestPracticesFormatted = categoryInfo.bestPractices.map((bp) => `- ${bp}`).join('\n')

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
}

function generateWorkflowAutomationTemplate(
  skillName: string,
  skillDescription: string,
  categoryInfo: TemplateCategoryInfo
): string {
  const bestPracticesFormatted = categoryInfo.bestPractices.map((bp) => `- ${bp}`).join('\n')

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
}

function generateCodeAnalysisTemplate(
  skillName: string,
  skillDescription: string,
  categoryInfo: TemplateCategoryInfo
): string {
  const bestPracticesFormatted = categoryInfo.bestPractices.map((bp) => `- ${bp}`).join('\n')

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
}

function generateDocumentationTemplate(
  skillName: string,
  skillDescription: string,
  categoryInfo: TemplateCategoryInfo
): string {
  const bestPracticesFormatted = categoryInfo.bestPractices.map((bp) => `- ${bp}`).join('\n')

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
}

function generateTestingTemplate(
  skillName: string,
  skillDescription: string,
  categoryInfo: TemplateCategoryInfo
): string {
  const bestPracticesFormatted = categoryInfo.bestPractices.map((bp) => `- ${bp}`).join('\n')

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
}

export function useTemplateGenerator({
  categoryInfo,
  skillName,
  skillDescription,
  selectedCategory,
  selectedTools,
  generatedId,
}: UseTemplateGeneratorParams) {
  const generatedContent = useMemo(() => {
    if (!categoryInfo || !skillName) return ''

    switch (selectedCategory) {
      case 'data-reference':
        return generateDataReferenceTemplate(skillName, skillDescription, categoryInfo)
      case 'workflow-automation':
        return generateWorkflowAutomationTemplate(skillName, skillDescription, categoryInfo)
      case 'code-analysis':
        return generateCodeAnalysisTemplate(skillName, skillDescription, categoryInfo)
      case 'documentation':
        return generateDocumentationTemplate(skillName, skillDescription, categoryInfo)
      case 'testing':
        return generateTestingTemplate(skillName, skillDescription, categoryInfo)
      default:
        return ''
    }
  }, [categoryInfo, skillName, skillDescription, selectedCategory])

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

  return { generatedContent, fullTemplate }
}
