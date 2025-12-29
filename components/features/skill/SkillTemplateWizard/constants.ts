import type { TemplateCategoryInfo, WizardStep } from './types'

export const TEMPLATE_CATEGORIES: TemplateCategoryInfo[] = [
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

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'category', label: '템플릿 선택', description: '스킬 유형 선택' },
  { id: 'basic', label: '기본 정보', description: '이름과 설명 입력' },
  { id: 'tools', label: '도구 선택', description: '사용 도구 설정' },
  { id: 'preview', label: '미리보기', description: '코드 확인 및 복사' },
]
