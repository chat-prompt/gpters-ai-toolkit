/**
 * Prompt Examples Library Data
 *
 * This file contains curated prompt examples organized by category.
 * Each example includes the prompt text, expected outcome, and related skills/agents.
 */

export type PromptCategory =
  | 'code-review'
  | 'documentation'
  | 'bug-fix'
  | 'refactoring'
  | 'testing'
  | 'implementation'
  | 'analysis'

export interface PromptExample {
  id: string
  category: PromptCategory
  title: string
  prompt: string
  expectedOutcome: string
  useCase: string
  relatedItems: {
    id: string
    type: 'skill' | 'agent' | 'command'
    name: string
  }[]
  tags: string[]
  difficulty: 'easy' | 'medium' | 'hard'
}

export const PROMPT_CATEGORIES: Record<
  PromptCategory,
  { label: string; icon: string; description: string; color: string }
> = {
  'code-review': {
    label: '코드 리뷰',
    icon: '🔍',
    description: '코드 품질, 보안, 성능 검토를 위한 프롬프트',
    color: 'from-blue-400 to-cyan-400',
  },
  documentation: {
    label: '문서 작성',
    icon: '📝',
    description: 'README, API 문서, 주석 생성을 위한 프롬프트',
    color: 'from-emerald-400 to-teal-400',
  },
  'bug-fix': {
    label: '버그 수정',
    icon: '🐛',
    description: '버그 분석 및 수정을 위한 프롬프트',
    color: 'from-red-400 to-rose-400',
  },
  refactoring: {
    label: '리팩토링',
    icon: '🔄',
    description: '코드 구조 개선 및 최적화를 위한 프롬프트',
    color: 'from-purple-400 to-violet-400',
  },
  testing: {
    label: '테스트 생성',
    icon: '🧪',
    description: '단위 테스트, E2E 테스트 작성을 위한 프롬프트',
    color: 'from-amber-400 to-orange-400',
  },
  implementation: {
    label: '기능 구현',
    icon: '🚀',
    description: '새로운 기능 개발을 위한 프롬프트',
    color: 'from-pink-400 to-fuchsia-400',
  },
  analysis: {
    label: '코드 분석',
    icon: '📊',
    description: '코드베이스 분석 및 이해를 위한 프롬프트',
    color: 'from-indigo-400 to-blue-400',
  },
}

export const PROMPT_EXAMPLES: PromptExample[] = [
  // Code Review Examples
  {
    id: 'review-pr-comprehensive',
    category: 'code-review',
    title: 'PR 종합 리뷰',
    prompt: `이 PR의 변경사항을 종합적으로 리뷰해주세요.

다음 관점에서 검토해주세요:
1. 코드 품질 및 가독성
2. 잠재적 버그나 엣지 케이스
3. 성능 이슈
4. 보안 취약점
5. 테스트 커버리지

각 이슈에 대해 구체적인 개선 방안도 제안해주세요.`,
    expectedOutcome:
      '코드의 문제점과 개선점이 카테고리별로 정리된 상세한 리뷰 결과',
    useCase: 'PR 머지 전 품질 검증이 필요할 때',
    relatedItems: [
      { id: 'code-reviewer', type: 'agent', name: 'Code Reviewer Agent' },
    ],
    tags: ['review', 'code', 'quality'],
    difficulty: 'medium',
  },
  {
    id: 'review-security-focus',
    category: 'code-review',
    title: '보안 중심 리뷰',
    prompt: `이 코드의 보안 취약점을 분석해주세요.

특히 다음 항목을 중점적으로 확인해주세요:
- SQL Injection
- XSS (Cross-Site Scripting)
- 인증/인가 우회 가능성
- 민감 정보 노출
- CSRF 취약점
- 의존성 보안 이슈

발견된 취약점에 대해 OWASP 기준 심각도와 수정 방법을 제시해주세요.`,
    expectedOutcome: '보안 취약점 목록과 OWASP 기준 심각도, 수정 가이드',
    useCase: '보안 감사가 필요한 코드를 검토할 때',
    relatedItems: [
      { id: 'security-scanner', type: 'skill', name: 'Security Scanner' },
    ],
    tags: ['security', 'review', 'audit'],
    difficulty: 'hard',
  },
  {
    id: 'review-performance',
    category: 'code-review',
    title: '성능 리뷰',
    prompt: `이 코드의 성능 이슈를 분석해주세요.

다음 관점에서 검토해주세요:
1. 시간 복잡도 분석 (Big O)
2. 메모리 사용 패턴
3. 불필요한 재연산이나 중복 호출
4. N+1 쿼리 문제 (DB 관련 코드인 경우)
5. 비동기 처리 최적화 가능성

각 이슈에 대해 최적화 방안을 코드 예시와 함께 제시해주세요.`,
    expectedOutcome: '성능 병목 지점 분석과 최적화된 코드 예시',
    useCase: '성능 최적화가 필요한 코드를 검토할 때',
    relatedItems: [],
    tags: ['performance', 'optimization', 'review'],
    difficulty: 'hard',
  },

  // Documentation Examples
  {
    id: 'doc-readme-generate',
    category: 'documentation',
    title: 'README 생성',
    prompt: `이 프로젝트의 README.md를 작성해주세요.

다음 섹션을 포함해주세요:
- 프로젝트 개요 및 목적
- 주요 기능
- 설치 방법
- 사용법 (예시 포함)
- 환경 변수 설정
- 기여 가이드
- 라이센스

마크다운 형식으로 깔끔하게 정리해주세요.`,
    expectedOutcome: '프로젝트를 소개하는 완성된 README.md 파일',
    useCase: '새 프로젝트의 문서화가 필요할 때',
    relatedItems: [
      { id: 'readme-generator', type: 'skill', name: 'README Generator' },
    ],
    tags: ['documentation', 'readme', 'markdown'],
    difficulty: 'easy',
  },
  {
    id: 'doc-api-endpoint',
    category: 'documentation',
    title: 'API 문서 작성',
    prompt: `이 API 엔드포인트의 문서를 작성해주세요.

다음 정보를 포함해주세요:
- 엔드포인트 URL 및 HTTP 메서드
- 요청 파라미터 (query, body, path params)
- 요청 헤더 (인증 포함)
- 응답 형식 및 상태 코드
- 에러 응답 케이스
- curl 예시

OpenAPI/Swagger 형식과 마크다운 형식 둘 다 제공해주세요.`,
    expectedOutcome: 'OpenAPI 스펙과 마크다운 형식의 API 문서',
    useCase: 'API 엔드포인트 문서화가 필요할 때',
    relatedItems: [],
    tags: ['api', 'documentation', 'openapi'],
    difficulty: 'medium',
  },
  {
    id: 'doc-code-comments',
    category: 'documentation',
    title: '코드 주석 추가',
    prompt: `이 코드에 JSDoc/TSDoc 스타일의 주석을 추가해주세요.

포함할 내용:
- 함수/클래스 설명
- 파라미터 설명 및 타입
- 반환값 설명
- 예외 케이스
- 사용 예시
- @since, @author 등 메타 정보

복잡한 로직에는 인라인 주석도 추가해주세요.`,
    expectedOutcome: '문서화 주석이 추가된 코드',
    useCase: '코드의 가독성과 유지보수성을 높이고 싶을 때',
    relatedItems: [],
    tags: ['documentation', 'comments', 'jsdoc'],
    difficulty: 'easy',
  },

  // Bug Fix Examples
  {
    id: 'bug-analyze-error',
    category: 'bug-fix',
    title: '에러 분석 및 수정',
    prompt: `다음 에러가 발생했습니다:

[에러 메시지를 여기에 붙여넣기]

이 에러의 원인을 분석하고 수정 방법을 제안해주세요.

다음 정보를 제공해주세요:
1. 에러의 근본 원인
2. 발생 조건 및 재현 방법
3. 수정 코드
4. 유사한 에러 방지를 위한 가이드`,
    expectedOutcome: '에러 원인 분석과 수정된 코드',
    useCase: '프로덕션에서 발생한 에러를 빠르게 해결해야 할 때',
    relatedItems: [
      { id: 'bug-hunter', type: 'agent', name: 'Bug Hunter Agent' },
    ],
    tags: ['debugging', 'error', 'fix'],
    difficulty: 'medium',
  },
  {
    id: 'bug-memory-leak',
    category: 'bug-fix',
    title: '메모리 누수 탐지',
    prompt: `이 코드에서 메모리 누수가 의심됩니다. 분석해주세요.

확인해야 할 사항:
1. 정리되지 않은 이벤트 리스너
2. 클로저로 인한 참조 유지
3. 정리되지 않은 타이머/인터벌
4. 구독 해제되지 않은 Observable
5. 캐시된 객체의 무한 증가

문제가 발견되면 수정 코드와 함께 메모리 프로파일링 방법도 안내해주세요.`,
    expectedOutcome: '메모리 누수 원인과 수정 코드, 프로파일링 가이드',
    useCase: '애플리케이션 메모리 사용량이 계속 증가할 때',
    relatedItems: [],
    tags: ['memory', 'debugging', 'performance'],
    difficulty: 'hard',
  },
  {
    id: 'bug-race-condition',
    category: 'bug-fix',
    title: '레이스 컨디션 분석',
    prompt: `이 비동기 코드에서 간헐적인 버그가 발생합니다. 레이스 컨디션 가능성을 분석해주세요.

확인해야 할 사항:
1. 공유 상태에 대한 동시 접근
2. 비동기 작업 순서 의존성
3. 적절한 동기화 메커니즘 사용 여부
4. Promise/async-await 사용 패턴

문제가 발견되면 안전한 패턴으로 수정해주세요.`,
    expectedOutcome: '레이스 컨디션 분석 결과와 thread-safe한 코드',
    useCase: '비동기 코드에서 간헐적 버그가 발생할 때',
    relatedItems: [],
    tags: ['async', 'debugging', 'concurrency'],
    difficulty: 'hard',
  },

  // Refactoring Examples
  {
    id: 'refactor-extract-function',
    category: 'refactoring',
    title: '함수 추출 리팩토링',
    prompt: `이 코드를 더 작은 함수들로 분리해주세요.

리팩토링 가이드:
1. 단일 책임 원칙 적용
2. 각 함수는 한 가지 일만 수행
3. 함수 이름으로 의도가 명확히 드러나게
4. 재사용 가능한 부분 추출
5. 테스트하기 쉬운 구조로 변경

Before/After 비교와 함께 설명해주세요.`,
    expectedOutcome: '작은 함수들로 분리된 깔끔한 코드와 설명',
    useCase: '긴 함수를 관리하기 쉽게 분리하고 싶을 때',
    relatedItems: [
      { id: 'refactoring-guru', type: 'skill', name: 'Refactoring Guru' },
    ],
    tags: ['refactoring', 'clean-code', 'solid'],
    difficulty: 'medium',
  },
  {
    id: 'refactor-design-pattern',
    category: 'refactoring',
    title: '디자인 패턴 적용',
    prompt: `이 코드에 적절한 디자인 패턴을 적용해주세요.

현재 문제점:
- [문제점 설명]

적용을 고려할 패턴:
- Strategy Pattern
- Factory Pattern
- Observer Pattern
- Decorator Pattern
- Dependency Injection

왜 특정 패턴이 적합한지 설명하고, 패턴 적용 후 코드를 보여주세요.`,
    expectedOutcome: '디자인 패턴이 적용된 코드와 패턴 선택 이유',
    useCase: '코드 구조를 개선하고 확장성을 높이고 싶을 때',
    relatedItems: [],
    tags: ['design-pattern', 'refactoring', 'architecture'],
    difficulty: 'hard',
  },
  {
    id: 'refactor-typescript-strict',
    category: 'refactoring',
    title: 'TypeScript 엄격 모드 적용',
    prompt: `이 TypeScript 코드를 strict 모드에 호환되도록 수정해주세요.

수정해야 할 사항:
1. any 타입 제거
2. null/undefined 처리 강화
3. 암시적 타입 명시
4. strict null checks 적용
5. unknown 대신 적절한 타입 사용

타입 안전성을 높이면서 런타임 동작은 유지해주세요.`,
    expectedOutcome: 'strict 모드 호환 TypeScript 코드',
    useCase: 'TypeScript 프로젝트의 타입 안전성을 높이고 싶을 때',
    relatedItems: [],
    tags: ['typescript', 'refactoring', 'type-safety'],
    difficulty: 'medium',
  },

  // Testing Examples
  {
    id: 'test-unit-generate',
    category: 'testing',
    title: '단위 테스트 생성',
    prompt: `이 함수에 대한 단위 테스트를 작성해주세요.

테스트 프레임워크: Vitest (또는 Jest)

포함해야 할 테스트 케이스:
1. 정상 입력에 대한 동작
2. 엣지 케이스 (빈 값, 경계값 등)
3. 에러 케이스 (잘못된 입력)
4. 비동기 동작 (해당되는 경우)

AAA (Arrange-Act-Assert) 패턴을 사용하고, describe/it으로 구조화해주세요.`,
    expectedOutcome: '완성된 단위 테스트 파일',
    useCase: '새로운 함수나 모듈의 테스트가 필요할 때',
    relatedItems: [
      { id: 'test-generator', type: 'skill', name: 'Test Generator' },
    ],
    tags: ['testing', 'unit-test', 'vitest'],
    difficulty: 'medium',
  },
  {
    id: 'test-e2e-generate',
    category: 'testing',
    title: 'E2E 테스트 생성',
    prompt: `이 사용자 흐름에 대한 E2E 테스트를 작성해주세요.

테스트 프레임워크: Playwright

사용자 시나리오:
[시나리오 설명]

포함해야 할 사항:
1. 페이지 네비게이션
2. 폼 입력 및 제출
3. UI 상태 검증
4. 에러 케이스 처리
5. 네트워크 요청 모킹 (필요시)

Page Object Model 패턴 사용을 권장합니다.`,
    expectedOutcome: 'Playwright E2E 테스트 파일',
    useCase: '사용자 시나리오 테스트가 필요할 때',
    relatedItems: [],
    tags: ['testing', 'e2e', 'playwright'],
    difficulty: 'hard',
  },
  {
    id: 'test-coverage-improve',
    category: 'testing',
    title: '테스트 커버리지 개선',
    prompt: `현재 테스트 커버리지를 분석하고 개선해주세요.

현재 커버리지: [커버리지 리포트 붙여넣기]

다음 작업을 수행해주세요:
1. 커버되지 않은 코드 식별
2. 누락된 테스트 케이스 추가
3. 브랜치 커버리지 개선
4. 중요한 비즈니스 로직 커버리지 우선

목표 커버리지: 80% 이상`,
    expectedOutcome: '추가 테스트 코드와 개선된 커버리지 리포트',
    useCase: '테스트 커버리지를 높여야 할 때',
    relatedItems: [],
    tags: ['testing', 'coverage', 'quality'],
    difficulty: 'medium',
  },

  // Implementation Examples
  {
    id: 'impl-feature-tdd',
    category: 'implementation',
    title: 'TDD로 기능 구현',
    prompt: `TDD 방식으로 다음 기능을 구현해주세요.

기능 요구사항:
[요구사항 설명]

단계:
1. 실패하는 테스트 먼저 작성
2. 테스트를 통과하는 최소한의 코드 작성
3. 리팩토링
4. 다음 테스트 케이스로 반복

각 단계를 보여주면서 구현해주세요.`,
    expectedOutcome: 'TDD 과정이 담긴 테스트 코드와 구현 코드',
    useCase: '안정적인 기능을 TDD로 개발하고 싶을 때',
    relatedItems: [],
    tags: ['implementation', 'tdd', 'testing'],
    difficulty: 'medium',
  },
  {
    id: 'impl-api-endpoint',
    category: 'implementation',
    title: 'API 엔드포인트 구현',
    prompt: `다음 요구사항에 맞는 REST API 엔드포인트를 구현해주세요.

요구사항:
- 엔드포인트: [URL]
- HTTP 메서드: [GET/POST/PUT/DELETE]
- 기능: [기능 설명]

포함해야 할 사항:
1. 입력 유효성 검사
2. 에러 핸들링
3. 인증/인가 처리
4. 응답 형식 통일
5. API 문서 (JSDoc/OpenAPI)`,
    expectedOutcome: '완성된 API 엔드포인트 코드와 문서',
    useCase: '새로운 API 엔드포인트를 추가해야 할 때',
    relatedItems: [],
    tags: ['api', 'implementation', 'rest'],
    difficulty: 'medium',
  },
  {
    id: 'impl-react-component',
    category: 'implementation',
    title: 'React 컴포넌트 구현',
    prompt: `다음 요구사항에 맞는 React 컴포넌트를 구현해주세요.

요구사항:
- 컴포넌트 이름: [이름]
- 기능: [기능 설명]
- Props: [Props 목록]

포함해야 할 사항:
1. TypeScript 타입 정의
2. 접근성 (ARIA 속성)
3. 반응형 디자인
4. 로딩/에러 상태 처리
5. Storybook 스토리 (선택)

Best practices를 따라 구현해주세요.`,
    expectedOutcome: '완성된 React 컴포넌트와 타입 정의',
    useCase: '새로운 UI 컴포넌트가 필요할 때',
    relatedItems: [],
    tags: ['react', 'implementation', 'frontend'],
    difficulty: 'medium',
  },

  // Analysis Examples
  {
    id: 'analysis-codebase-overview',
    category: 'analysis',
    title: '코드베이스 구조 분석',
    prompt: `이 프로젝트의 전체 구조를 분석해주세요.

분석 항목:
1. 디렉토리 구조 및 아키텍처 패턴
2. 주요 모듈과 의존성 관계
3. 진입점과 데이터 흐름
4. 사용된 기술 스택
5. 설정 파일 및 환경 변수

새로운 팀원이 이해할 수 있도록 다이어그램과 함께 설명해주세요.`,
    expectedOutcome: '프로젝트 구조 문서와 아키텍처 다이어그램',
    useCase: '새 프로젝트에 온보딩하거나 팀에 공유할 때',
    relatedItems: [
      { id: 'codebase-analyzer', type: 'skill', name: 'Codebase Analyzer' },
    ],
    tags: ['analysis', 'architecture', 'documentation'],
    difficulty: 'medium',
  },
  {
    id: 'analysis-dependency',
    category: 'analysis',
    title: '의존성 분석',
    prompt: `이 프로젝트의 의존성을 분석해주세요.

분석 항목:
1. 직접 의존성 목록 및 버전
2. 취약점이 있는 패키지
3. 오래된 패키지 (업데이트 필요)
4. 불필요한 의존성
5. 라이센스 호환성

개선이 필요한 항목에 대해 우선순위와 함께 제안해주세요.`,
    expectedOutcome: '의존성 분석 리포트와 업데이트 가이드',
    useCase: '프로젝트 의존성을 정리하고 보안을 강화할 때',
    relatedItems: [],
    tags: ['analysis', 'dependencies', 'security'],
    difficulty: 'easy',
  },
  {
    id: 'analysis-complexity',
    category: 'analysis',
    title: '코드 복잡도 분석',
    prompt: `이 코드의 복잡도를 분석해주세요.

분석 지표:
1. Cyclomatic Complexity
2. Cognitive Complexity
3. Lines of Code (LOC)
4. 함수/클래스 길이
5. 중첩 깊이

복잡도가 높은 부분을 식별하고 개선 방안을 제시해주세요.`,
    expectedOutcome: '복잡도 분석 리포트와 리팩토링 제안',
    useCase: '코드 품질을 측정하고 개선 우선순위를 정할 때',
    relatedItems: [],
    tags: ['analysis', 'complexity', 'quality'],
    difficulty: 'medium',
  },
]

/**
 * Get all prompt examples
 */
export function getAllPromptExamples(): PromptExample[] {
  return PROMPT_EXAMPLES
}

/**
 * Get prompt examples by category
 */
export function getPromptExamplesByCategory(
  category: PromptCategory
): PromptExample[] {
  return PROMPT_EXAMPLES.filter((example) => example.category === category)
}

/**
 * Search prompt examples by query
 */
export function searchPromptExamples(query: string): PromptExample[] {
  const lowerQuery = query.toLowerCase()
  return PROMPT_EXAMPLES.filter(
    (example) =>
      example.title.toLowerCase().includes(lowerQuery) ||
      example.prompt.toLowerCase().includes(lowerQuery) ||
      example.expectedOutcome.toLowerCase().includes(lowerQuery) ||
      example.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Get prompt example by ID
 */
export function getPromptExampleById(id: string): PromptExample | undefined {
  return PROMPT_EXAMPLES.find((example) => example.id === id)
}

/**
 * Get all unique tags from prompt examples
 */
export function getAllPromptTags(): string[] {
  const tagSet = new Set<string>()
  PROMPT_EXAMPLES.forEach((example) => {
    example.tags.forEach((tag) => tagSet.add(tag))
  })
  return Array.from(tagSet).sort()
}
