/**
 * Agent Permission Mode Configuration
 *
 * Provides detailed information about Claude Code agent permission modes:
 * - Mode descriptions and behaviors
 * - Security impact warnings
 * - Use case examples
 * - Recommendation engine
 */

import { AgentPermissionMode } from '../core/types'

/**
 * Security level for permission modes
 */
export type SecurityLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * Detailed permission mode information
 */
export interface PermissionModeInfo {
  mode: AgentPermissionMode
  label: string
  shortDescription: string
  fullDescription: string
  securityLevel: SecurityLevel
  securityWarnings: string[]
  allowedOperations: string[]
  blockedOperations: string[]
  useCases: UseCase[]
  bestPractices: string[]
  notRecommendedFor: string[]
}

/**
 * Use case example
 */
export interface UseCase {
  title: string
  description: string
  scenario: string
  example?: string
}

/**
 * Security level configuration
 */
export const SECURITY_LEVELS: Record<
  SecurityLevel,
  {
    label: string
    color: string
    bgColor: string
    borderColor: string
    icon: string
    description: string
  }
> = {
  low: {
    label: '낮음',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '🟢',
    description: '최소한의 자동 실행, 모든 주요 작업에 사용자 확인 필요',
  },
  medium: {
    label: '보통',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: '🟡',
    description: '일부 작업 자동 승인, 중요 작업은 사용자 확인 필요',
  },
  high: {
    label: '높음',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '🟠',
    description: '대부분의 작업 자동 실행, 주의 필요',
  },
  critical: {
    label: '위험',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '🔴',
    description: '모든 작업 자동 실행, 신뢰할 수 있는 환경에서만 사용',
  },
}

/**
 * Permission mode configurations
 */
export const PERMISSION_MODES: Record<AgentPermissionMode, PermissionModeInfo> = {
  default: {
    mode: 'default',
    label: 'Default (기본)',
    shortDescription: '모든 도구 사용에 사용자 확인 필요',
    fullDescription:
      '가장 안전한 모드입니다. Agent가 도구를 사용할 때마다 사용자의 명시적인 승인을 요청합니다. 파일 읽기, 쓰기, 명령어 실행 등 모든 작업에 확인이 필요합니다.',
    securityLevel: 'low',
    securityWarnings: [
      '사용자 확인 없이는 어떤 작업도 수행되지 않습니다',
      '각 도구 사용마다 승인/거부를 선택해야 합니다',
    ],
    allowedOperations: ['사용자 승인 후 모든 도구 사용 가능'],
    blockedOperations: ['사용자 승인 없는 모든 자동 실행'],
    useCases: [
      {
        title: '보안 민감한 프로젝트',
        description: '금융, 의료 등 민감한 데이터를 다루는 프로젝트',
        scenario: '고객 정보가 포함된 코드베이스에서 작업할 때',
        example: 'Agent가 파일을 읽기 전 항상 확인: "lib/customer-data.ts 파일을 읽어도 될까요?"',
      },
      {
        title: '새로운 Agent 테스트',
        description: '처음 사용하는 Agent의 동작을 확인하고 싶을 때',
        scenario: 'Agent가 어떤 도구를 어떻게 사용하는지 학습할 때',
      },
      {
        title: '교육 및 학습',
        description: 'Claude Code의 작동 방식을 이해하고 싶을 때',
        scenario: '팀원들에게 Agent 동작을 데모할 때',
      },
    ],
    bestPractices: [
      '처음 사용하는 Agent에는 항상 default 모드 권장',
      '민감한 데이터가 있는 프로젝트에서 사용',
      'Agent의 동작 패턴을 먼저 파악한 후 다른 모드로 전환',
    ],
    notRecommendedFor: [
      '빠른 반복 작업이 필요한 경우',
      '대량의 파일을 처리해야 하는 경우',
      '완전히 신뢰하는 환경에서의 자동화',
    ],
  },
  acceptEdits: {
    mode: 'acceptEdits',
    label: 'Accept Edits (편집 자동 승인)',
    shortDescription: '파일 편집 자동 승인, 다른 작업은 확인 필요',
    fullDescription:
      '파일 읽기와 편집(Write, Edit, MultiEdit)을 자동으로 승인합니다. Bash 명령어 실행 등 다른 도구 사용은 여전히 사용자 확인이 필요합니다. 코드 리팩토링이나 문서 작업에 적합합니다.',
    securityLevel: 'medium',
    securityWarnings: [
      '파일이 사용자 확인 없이 자동으로 수정될 수 있습니다',
      'Git으로 변경사항을 추적하는 것을 강력히 권장합니다',
      '민감한 파일(.env, credentials 등)이 수정될 수 있습니다',
    ],
    allowedOperations: [
      'Read - 파일 읽기',
      'Write - 파일 쓰기',
      'Edit - 파일 편집',
      'MultiEdit - 다중 파일 편집',
      'Glob - 파일 검색',
      'Grep - 텍스트 검색',
    ],
    blockedOperations: [
      'Bash - 명령어 실행 (확인 필요)',
      'Task - 서브에이전트 생성 (확인 필요)',
      'WebFetch - 외부 URL 접근 (확인 필요)',
    ],
    useCases: [
      {
        title: '코드 리팩토링',
        description: '대규모 코드베이스 리팩토링 작업',
        scenario: '변수명 일괄 변경, 함수 추출, 패턴 적용 등',
        example: '"모든 console.log를 logger로 교체해줘" - 수십 개 파일 자동 수정',
      },
      {
        title: '문서 작업',
        description: 'README, API 문서, 주석 작성',
        scenario: '코드베이스 전체에 JSDoc 주석 추가',
      },
      {
        title: '코드 생성',
        description: '보일러플레이트 코드나 테스트 코드 생성',
        scenario: 'CRUD API 엔드포인트 일괄 생성',
      },
    ],
    bestPractices: [
      'Git 저장소에서만 사용하고, 작업 전 커밋 권장',
      '.gitignore에 민감한 파일이 포함되어 있는지 확인',
      'Agent 작업 후 git diff로 변경사항 검토',
      '중요한 작업 전 브랜치 분리',
    ],
    notRecommendedFor: [
      'Git이 설정되지 않은 프로젝트',
      '실행 중인 프로덕션 코드가 있는 디렉토리',
      '민감한 설정 파일이 있는 경우',
    ],
  },
  bypassPermissions: {
    mode: 'bypassPermissions',
    label: 'Bypass Permissions (권한 우회)',
    shortDescription: '모든 도구 사용 자동 승인',
    fullDescription:
      '⚠️ 주의: 모든 도구 사용이 자동으로 승인됩니다. Bash 명령어 실행, 파일 수정, 외부 네트워크 접근 등 모든 작업이 확인 없이 실행됩니다. 완전히 신뢰할 수 있는 격리된 환경에서만 사용하세요.',
    securityLevel: 'critical',
    securityWarnings: [
      '⚠️ 모든 Bash 명령어가 자동으로 실행됩니다',
      '⚠️ rm -rf, 네트워크 요청 등 위험한 명령도 실행될 수 있습니다',
      '⚠️ 시스템 설정이 변경될 수 있습니다',
      '⚠️ 외부 서비스에 데이터가 전송될 수 있습니다',
      '⚠️ 반드시 격리된 환경(VM, 컨테이너)에서만 사용하세요',
    ],
    allowedOperations: [
      'Read - 모든 파일 읽기',
      'Write/Edit - 모든 파일 수정',
      'Bash - 모든 명령어 실행',
      'WebFetch - 외부 URL 접근',
      'Task - 서브에이전트 생성',
      '기타 모든 도구',
    ],
    blockedOperations: [],
    useCases: [
      {
        title: 'CI/CD 파이프라인',
        description: '자동화된 빌드/테스트/배포 환경',
        scenario: 'GitHub Actions, GitLab CI 등에서 Agent 실행',
        example: 'Agent가 자동으로 테스트 실행, 빌드, 린트 수행',
      },
      {
        title: '격리된 개발 환경',
        description: 'Docker 컨테이너나 VM 내에서의 작업',
        scenario: '일회용 개발 환경에서 대규모 자동화 작업',
      },
      {
        title: '신뢰할 수 있는 Agent 자동화',
        description: '완전히 검증된 Agent의 무인 실행',
        scenario: '매일 밤 자동으로 코드 분석 리포트 생성',
      },
    ],
    bestPractices: [
      '반드시 격리된 환경(Docker, VM)에서만 사용',
      '실행 로그를 반드시 기록하고 모니터링',
      'Agent 스크립트를 사전에 충분히 테스트',
      '네트워크 접근이 필요 없다면 네트워크 격리',
      '중요한 데이터가 있는 디렉토리에 마운트하지 않기',
    ],
    notRecommendedFor: [
      '로컬 개발 환경',
      '프로덕션 서버',
      '민감한 데이터가 있는 시스템',
      '새로운/검증되지 않은 Agent',
      '신뢰할 수 없는 사용자 입력을 처리하는 경우',
    ],
  },
  plan: {
    mode: 'plan',
    label: 'Plan (계획 모드)',
    shortDescription: '실행 없이 계획만 수립',
    fullDescription:
      'Agent가 실제 도구를 사용하지 않고 작업 계획만 수립합니다. 복잡한 작업을 시작하기 전에 Agent가 어떤 접근 방식을 취할지 미리 검토할 수 있습니다.',
    securityLevel: 'low',
    securityWarnings: [
      '실제 작업이 수행되지 않으므로 결과물이 없습니다',
      '계획 검토 후 다른 모드로 전환하여 실행해야 합니다',
    ],
    allowedOperations: ['계획 수립 및 설명', '작업 분석 및 제안'],
    blockedOperations: ['모든 도구 사용이 실행되지 않음', 'Read, Write, Bash 등 모든 도구 차단'],
    useCases: [
      {
        title: '복잡한 작업 검토',
        description: '대규모 리팩토링이나 마이그레이션 전 계획 수립',
        scenario: '"이 모노레포를 마이크로서비스로 분리하려면 어떻게 해야 할까?"',
        example:
          'Agent가 분석 계획, 단계별 접근 방식, 예상 리스크를 상세히 설명하지만 실행하지 않음',
      },
      {
        title: '학습 및 교육',
        description: 'Agent의 문제 해결 접근 방식 이해',
        scenario: '특정 버그를 어떻게 디버깅할지 접근 방식 확인',
      },
      {
        title: '비용 예측',
        description: 'Agent 작업의 토큰 사용량 예측',
        scenario: '대규모 작업 전 예상 비용과 시간 확인',
      },
    ],
    bestPractices: [
      '복잡한 작업 시작 전 항상 plan 모드로 검토',
      '계획이 적절한지 확인 후 acceptEdits나 default로 전환',
      '팀과 작업 계획을 공유할 때 활용',
    ],
    notRecommendedFor: ['즉시 결과물이 필요한 간단한 작업', '반복적인 자동화 작업'],
  },
  ignore: {
    mode: 'ignore',
    label: 'Ignore (무시)',
    shortDescription: 'Agent의 권한 모드 설정 무시',
    fullDescription:
      "Agent 정의에 설정된 권한 모드를 무시하고, 실행 시점의 기본 설정을 따릅니다. Agent 파일에 'bypassPermissions'가 설정되어 있어도 무시됩니다.",
    securityLevel: 'medium',
    securityWarnings: [
      'Agent 제작자가 의도한 권한 설정이 무시됩니다',
      '실행 환경의 기본 설정에 의존하게 됩니다',
    ],
    allowedOperations: ['실행 환경의 기본 권한 설정을 따름'],
    blockedOperations: ['Agent 파일에 정의된 권한 설정은 무시됨'],
    useCases: [
      {
        title: '신뢰할 수 없는 Agent 실행',
        description: 'bypassPermissions가 설정된 외부 Agent를 안전하게 실행',
        scenario: '카탈로그에서 설치한 Agent가 과도한 권한을 요청할 때',
        example:
          'Agent 파일에 bypassPermissions가 있어도 무시하고 default 모드로 실행',
      },
      {
        title: '권한 정책 통제',
        description: '팀/조직 차원에서 일관된 권한 정책 적용',
        scenario: '모든 Agent를 동일한 보안 수준으로 실행하고 싶을 때',
      },
    ],
    bestPractices: [
      '외부에서 가져온 Agent 실행 시 사용',
      '조직의 보안 정책을 일관되게 적용할 때 사용',
      'Agent 코드를 검토하기 전에 사용',
    ],
    notRecommendedFor: [
      '검증된 내부 Agent 실행 시',
      'Agent의 특정 권한이 필요한 자동화 작업',
    ],
  },
}

/**
 * Get permission mode info
 */
export function getPermissionModeInfo(mode: AgentPermissionMode): PermissionModeInfo {
  return PERMISSION_MODES[mode]
}

/**
 * Get all permission modes
 */
export function getAllPermissionModes(): PermissionModeInfo[] {
  return Object.values(PERMISSION_MODES)
}

/**
 * Get security level info
 */
export function getSecurityLevelInfo(level: SecurityLevel) {
  return SECURITY_LEVELS[level]
}

/**
 * Recommendation criteria
 */
export interface RecommendationCriteria {
  isProduction: boolean
  hasSensitiveData: boolean
  isGitRepository: boolean
  isIsolatedEnvironment: boolean
  isAutomated: boolean
  trustLevel: 'low' | 'medium' | 'high'
  taskComplexity: 'simple' | 'moderate' | 'complex'
}

/**
 * Permission mode recommendation
 */
export interface ModeRecommendation {
  recommended: AgentPermissionMode
  alternatives: AgentPermissionMode[]
  reasoning: string[]
  warnings: string[]
}

/**
 * Get permission mode recommendation based on criteria
 */
export function getRecommendation(criteria: RecommendationCriteria): ModeRecommendation {
  const warnings: string[] = []
  const reasoning: string[] = []

  // Critical safety checks
  if (criteria.isProduction) {
    warnings.push('프로덕션 환경에서는 자동화된 권한 모드 사용에 주의가 필요합니다')
    reasoning.push('프로덕션 환경이므로 보수적인 권한 설정을 권장합니다')
  }

  if (criteria.hasSensitiveData) {
    warnings.push('민감한 데이터가 있으므로 모든 작업에 주의가 필요합니다')
    reasoning.push('민감한 데이터 보호를 위해 확인 기반 모드를 권장합니다')
  }

  // Determine recommendation
  let recommended: AgentPermissionMode = 'default'
  let alternatives: AgentPermissionMode[] = []

  if (criteria.isIsolatedEnvironment && criteria.isAutomated && criteria.trustLevel === 'high') {
    recommended = 'bypassPermissions'
    alternatives = ['acceptEdits', 'default']
    reasoning.push('격리된 환경에서 신뢰할 수 있는 자동화 작업이므로 전체 권한 허용 가능')
  } else if (criteria.isGitRepository && !criteria.hasSensitiveData && criteria.trustLevel !== 'low') {
    recommended = 'acceptEdits'
    alternatives = ['default', 'plan']
    reasoning.push('Git으로 버전 관리가 되고 민감한 데이터가 없으므로 편집 자동 승인 권장')
  } else if (criteria.taskComplexity === 'complex') {
    recommended = 'plan'
    alternatives = ['default']
    reasoning.push('복잡한 작업이므로 먼저 계획을 검토하는 것을 권장')
  } else {
    recommended = 'default'
    alternatives = ['plan', 'acceptEdits']
    reasoning.push('안전을 위해 모든 작업에 사용자 확인을 권장')
  }

  // Override for low trust or sensitive environments
  if (criteria.trustLevel === 'low') {
    recommended = 'ignore'
    alternatives = ['default']
    warnings.push('낮은 신뢰 수준이므로 Agent의 권한 설정을 무시하고 기본 모드로 실행을 권장')
    reasoning.push('신뢰할 수 없는 Agent의 권한 요청을 무시합니다')
  }

  return {
    recommended,
    alternatives,
    reasoning,
    warnings,
  }
}

/**
 * Compare two permission modes
 */
export function compareModes(
  mode1: AgentPermissionMode,
  mode2: AgentPermissionMode
): {
  securityComparison: 'safer' | 'equal' | 'riskier'
  differences: string[]
} {
  const info1 = PERMISSION_MODES[mode1]
  const info2 = PERMISSION_MODES[mode2]

  const securityOrder: SecurityLevel[] = ['low', 'medium', 'high', 'critical']
  const level1 = securityOrder.indexOf(info1.securityLevel)
  const level2 = securityOrder.indexOf(info2.securityLevel)

  const securityComparison = level1 < level2 ? 'safer' : level1 > level2 ? 'riskier' : 'equal'

  const differences: string[] = []

  // Compare allowed operations
  const allowed1 = new Set(info1.allowedOperations)
  const allowed2 = new Set(info2.allowedOperations)

  const onlyIn1 = [...allowed1].filter((op) => !allowed2.has(op))
  const onlyIn2 = [...allowed2].filter((op) => !allowed1.has(op))

  if (onlyIn1.length > 0) {
    differences.push(`${mode1}에서만 허용: ${onlyIn1.join(', ')}`)
  }
  if (onlyIn2.length > 0) {
    differences.push(`${mode2}에서만 허용: ${onlyIn2.join(', ')}`)
  }

  return { securityComparison, differences }
}

/**
 * Validate permission mode for a given context
 */
export function validateModeForContext(
  mode: AgentPermissionMode,
  context: Partial<RecommendationCriteria>
): {
  isValid: boolean
  warnings: string[]
  suggestions: string[]
} {
  const warnings: string[] = []
  const suggestions: string[] = []
  let isValid = true

  // modeInfo is available for future use in validation messages
  const _modeInfo = PERMISSION_MODES[mode]

  // Check critical combinations
  if (mode === 'bypassPermissions') {
    if (context.isProduction) {
      isValid = false
      warnings.push('❌ 프로덕션 환경에서 bypassPermissions 사용은 금지됩니다')
      suggestions.push('acceptEdits 또는 default 모드를 사용하세요')
    }
    if (!context.isIsolatedEnvironment) {
      warnings.push('⚠️ 격리되지 않은 환경에서 bypassPermissions 사용은 위험합니다')
      suggestions.push('Docker 또는 VM 환경에서 실행하세요')
    }
    if (context.hasSensitiveData) {
      isValid = false
      warnings.push('❌ 민감한 데이터가 있는 환경에서 bypassPermissions 사용은 금지됩니다')
      suggestions.push('default 모드를 사용하고 필요시 개별 승인하세요')
    }
  }

  if (mode === 'acceptEdits') {
    if (!context.isGitRepository) {
      warnings.push('⚠️ Git 저장소가 아닌 경우 acceptEdits 사용에 주의하세요')
      suggestions.push('작업 전 백업을 만들거나 Git 저장소로 초기화하세요')
    }
  }

  return { isValid, warnings, suggestions }
}
