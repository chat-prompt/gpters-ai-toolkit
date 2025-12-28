/**
 * Plugin Verification and Authentication System
 *
 * Provides plugin safety verification:
 * - Code signature verification
 * - Security scan results
 * - Certified developer badges
 * - Dangerous plugin warnings
 */

import { createLogger } from '../logger'

const log = createLogger('plugin-verification')

/**
 * Verification status
 */
export type VerificationStatus =
  | 'verified'
  | 'unverified'
  | 'pending'
  | 'failed'
  | 'revoked'

/**
 * Security scan severity
 */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/**
 * Developer certification level
 */
export type CertificationLevel =
  | 'official'
  | 'verified'
  | 'community'
  | 'unverified'

/**
 * Risk level
 */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical'

/**
 * Security finding
 */
export interface SecurityFinding {
  id: string
  severity: SecuritySeverity
  category: SecurityCategory
  title: string
  description: string
  location?: string
  recommendation: string
  cweId?: string
}

/**
 * Security scan category
 */
export type SecurityCategory =
  | 'code-injection'
  | 'data-exposure'
  | 'permission-abuse'
  | 'network-risk'
  | 'file-system-risk'
  | 'dependency-risk'
  | 'cryptography'
  | 'authentication'
  | 'configuration'
  | 'other'

/**
 * Security scan result
 */
export interface SecurityScanResult {
  pluginId: string
  scannedAt: string
  scanVersion: string
  duration: number
  findings: SecurityFinding[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
  }
  riskLevel: RiskLevel
  passed: boolean
}

/**
 * Code signature
 */
export interface CodeSignature {
  algorithm: 'sha256' | 'sha384' | 'sha512'
  signature: string
  publicKey: string
  signedAt: string
  expiresAt?: string
  signedBy: string
}

/**
 * Developer info
 */
export interface DeveloperInfo {
  id: string
  name: string
  email?: string
  website?: string
  certificationLevel: CertificationLevel
  verifiedAt?: string
  badges: DeveloperBadge[]
  pluginCount: number
  totalDownloads: number
  reputation: number
}

/**
 * Developer badge
 */
export interface DeveloperBadge {
  id: string
  name: string
  description: string
  icon: string
  earnedAt: string
}

/**
 * Plugin verification result
 */
export interface PluginVerificationResult {
  pluginId: string
  pluginName: string
  version: string
  verificationStatus: VerificationStatus
  verifiedAt?: string
  signature?: CodeSignature
  securityScan?: SecurityScanResult
  developer: DeveloperInfo
  riskLevel: RiskLevel
  warnings: VerificationWarning[]
  recommendations: string[]
  canInstall: boolean
  requiresApproval: boolean
}

/**
 * Verification warning
 */
export interface VerificationWarning {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  details?: string
}

/**
 * Verification config
 */
export interface VerificationConfig {
  requireSignature: boolean
  requireSecurityScan: boolean
  maxAllowedSeverity: SecuritySeverity
  allowUnverifiedDevelopers: boolean
  autoRejectHighRisk: boolean
  trustedDevelopers: string[]
}

/**
 * Default verification config
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  requireSignature: false,
  requireSecurityScan: true,
  maxAllowedSeverity: 'medium',
  allowUnverifiedDevelopers: true,
  autoRejectHighRisk: true,
  trustedDevelopers: ['gpters-official', 'anthropic'],
}

/**
 * Certification level configuration
 */
export const CERTIFICATION_LEVELS: Record<
  CertificationLevel,
  {
    label: string
    description: string
    color: string
    bgColor: string
    icon: string
    trustLevel: number
  }
> = {
  official: {
    label: '공식',
    description: 'GPTers 공식 플러그인',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: '✓',
    trustLevel: 100,
  },
  verified: {
    label: '인증됨',
    description: '신원이 확인된 개발자',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: '✓',
    trustLevel: 80,
  },
  community: {
    label: '커뮤니티',
    description: '커뮤니티 기여자',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    icon: '★',
    trustLevel: 50,
  },
  unverified: {
    label: '미인증',
    description: '아직 인증되지 않은 개발자',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: '?',
    trustLevel: 20,
  },
}

/**
 * Risk level configuration
 */
export const RISK_LEVELS: Record<
  RiskLevel,
  {
    label: string
    description: string
    color: string
    bgColor: string
    borderColor: string
    icon: string
    recommendation: string
  }
> = {
  safe: {
    label: '안전',
    description: '보안 검사를 통과했습니다',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '🛡️',
    recommendation: '안심하고 설치할 수 있습니다',
  },
  low: {
    label: '낮음',
    description: '경미한 보안 이슈가 있습니다',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: '💙',
    recommendation: '정보성 이슈만 있으므로 대부분 안전합니다',
  },
  medium: {
    label: '보통',
    description: '일부 보안 주의사항이 있습니다',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: '⚠️',
    recommendation: '보안 이슈를 확인 후 설치하세요',
  },
  high: {
    label: '높음',
    description: '심각한 보안 이슈가 발견되었습니다',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '🔶',
    recommendation: '보안 이슈 해결 후 설치를 권장합니다',
  },
  critical: {
    label: '위험',
    description: '치명적인 보안 위협이 있습니다',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '🔴',
    recommendation: '이 플러그인의 설치를 권장하지 않습니다',
  },
}

/**
 * Security category configuration
 */
export const SECURITY_CATEGORIES: Record<
  SecurityCategory,
  {
    label: string
    description: string
    icon: string
  }
> = {
  'code-injection': {
    label: '코드 인젝션',
    description: '악성 코드 실행 위험',
    icon: '💉',
  },
  'data-exposure': {
    label: '데이터 노출',
    description: '민감한 데이터 유출 위험',
    icon: '📤',
  },
  'permission-abuse': {
    label: '권한 남용',
    description: '과도한 권한 요청',
    icon: '🔓',
  },
  'network-risk': {
    label: '네트워크 위험',
    description: '의심스러운 네트워크 활동',
    icon: '🌐',
  },
  'file-system-risk': {
    label: '파일 시스템 위험',
    description: '의심스러운 파일 접근',
    icon: '📁',
  },
  'dependency-risk': {
    label: '의존성 위험',
    description: '취약한 라이브러리 사용',
    icon: '📦',
  },
  cryptography: {
    label: '암호화',
    description: '취약한 암호화 사용',
    icon: '🔐',
  },
  authentication: {
    label: '인증',
    description: '취약한 인증 메커니즘',
    icon: '🔑',
  },
  configuration: {
    label: '설정',
    description: '보안에 취약한 설정',
    icon: '⚙️',
  },
  other: {
    label: '기타',
    description: '기타 보안 이슈',
    icon: '❓',
  },
}

/**
 * Calculate risk level from security findings
 */
export function calculateRiskLevel(findings: SecurityFinding[]): RiskLevel {
  if (findings.length === 0) return 'safe'

  const hasCritical = findings.some((f) => f.severity === 'critical')
  const hasHigh = findings.some((f) => f.severity === 'high')
  const hasMedium = findings.some((f) => f.severity === 'medium')
  const hasLow = findings.some((f) => f.severity === 'low')

  if (hasCritical) return 'critical'
  if (hasHigh) return 'high'
  if (hasMedium) return 'medium'
  if (hasLow) return 'low'
  return 'safe'
}

/**
 * Create mock security scan result
 */
export function createSecurityScan(
  pluginId: string,
  findings: SecurityFinding[] = []
): SecurityScanResult {
  const summary = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    info: findings.filter((f) => f.severity === 'info').length,
    total: findings.length,
  }

  const riskLevel = calculateRiskLevel(findings)
  const passed = riskLevel === 'safe' || riskLevel === 'low'

  return {
    pluginId,
    scannedAt: new Date().toISOString(),
    scanVersion: '1.0.0',
    duration: Math.random() * 5000 + 1000,
    findings,
    summary,
    riskLevel,
    passed,
  }
}

/**
 * Verify code signature
 */
export async function verifySignature(
  content: string,
  signature: CodeSignature
): Promise<{ valid: boolean; error?: string }> {
  try {
    // In a real implementation, this would use crypto APIs
    // For now, we simulate signature verification

    if (!signature.signature || !signature.publicKey) {
      return { valid: false, error: '서명 또는 공개키가 없습니다' }
    }

    if (signature.expiresAt && new Date(signature.expiresAt) < new Date()) {
      return { valid: false, error: '서명이 만료되었습니다' }
    }

    // Simulate async verification
    await new Promise((resolve) => setTimeout(resolve, 100))

    // In production, this would actually verify the signature
    const isValid = signature.signature.length >= 64

    log.info(`Signature verification for ${signature.signedBy}: ${isValid ? 'passed' : 'failed'}`)

    return { valid: isValid }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { valid: false, error: message }
  }
}

/**
 * Create plugin verification result
 */
export function createVerificationResult(
  pluginId: string,
  pluginName: string,
  version: string,
  developer: DeveloperInfo,
  signature?: CodeSignature,
  securityScan?: SecurityScanResult,
  config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG
): PluginVerificationResult {
  const warnings: VerificationWarning[] = []
  const recommendations: string[] = []

  // Check developer certification
  if (developer.certificationLevel === 'unverified') {
    warnings.push({
      severity: 'warning',
      code: 'UNVERIFIED_DEVELOPER',
      message: '이 플러그인은 미인증 개발자가 만들었습니다',
      details: '개발자의 신원이 확인되지 않았습니다. 주의해서 사용하세요.',
    })
    recommendations.push('개발자가 인증될 때까지 민감한 환경에서의 사용을 피하세요')
  }

  // Check signature
  let verificationStatus: VerificationStatus = 'unverified'
  if (signature) {
    if (signature.expiresAt && new Date(signature.expiresAt) < new Date()) {
      verificationStatus = 'failed'
      warnings.push({
        severity: 'error',
        code: 'SIGNATURE_EXPIRED',
        message: '코드 서명이 만료되었습니다',
      })
    } else {
      verificationStatus = 'verified'
    }
  } else if (config.requireSignature) {
    warnings.push({
      severity: 'error',
      code: 'SIGNATURE_MISSING',
      message: '코드 서명이 없습니다',
      details: '이 플러그인은 디지털 서명이 없어 무결성을 보장할 수 없습니다',
    })
    recommendations.push('서명된 버전의 플러그인을 사용하는 것을 권장합니다')
  }

  // Check security scan
  let riskLevel: RiskLevel = 'safe'
  if (securityScan) {
    riskLevel = securityScan.riskLevel

    if (securityScan.summary.critical > 0) {
      warnings.push({
        severity: 'error',
        code: 'CRITICAL_VULNERABILITIES',
        message: `${securityScan.summary.critical}개의 치명적인 취약점이 발견되었습니다`,
      })
    }

    if (securityScan.summary.high > 0) {
      warnings.push({
        severity: 'warning',
        code: 'HIGH_VULNERABILITIES',
        message: `${securityScan.summary.high}개의 심각한 취약점이 발견되었습니다`,
      })
    }
  } else if (config.requireSecurityScan) {
    warnings.push({
      severity: 'warning',
      code: 'SCAN_MISSING',
      message: '보안 스캔 결과가 없습니다',
      details: '이 플러그인은 아직 보안 검사를 받지 않았습니다',
    })
    recommendations.push('보안 스캔이 완료된 후 설치하는 것을 권장합니다')
  }

  // Determine if can install
  const canInstall =
    !config.autoRejectHighRisk ||
    (riskLevel !== 'critical' && riskLevel !== 'high')

  // Determine if requires approval
  const requiresApproval =
    developer.certificationLevel === 'unverified' ||
    riskLevel === 'medium' ||
    riskLevel === 'high'

  // Add trusted developer note
  if (config.trustedDevelopers.includes(developer.id)) {
    recommendations.unshift('이 플러그인은 신뢰할 수 있는 개발자가 만들었습니다')
  }

  return {
    pluginId,
    pluginName,
    version,
    verificationStatus,
    verifiedAt: verificationStatus === 'verified' ? new Date().toISOString() : undefined,
    signature,
    securityScan,
    developer,
    riskLevel,
    warnings,
    recommendations,
    canInstall,
    requiresApproval,
  }
}

/**
 * Create mock developer info
 */
export function createDeveloper(
  id: string,
  name: string,
  certificationLevel: CertificationLevel,
  options: Partial<DeveloperInfo> = {}
): DeveloperInfo {
  return {
    id,
    name,
    certificationLevel,
    badges: [],
    pluginCount: 0,
    totalDownloads: 0,
    reputation: CERTIFICATION_LEVELS[certificationLevel].trustLevel,
    ...options,
  }
}

/**
 * Create mock security finding
 */
export function createSecurityFinding(
  severity: SecuritySeverity,
  category: SecurityCategory,
  title: string,
  description: string,
  recommendation: string
): SecurityFinding {
  return {
    id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    severity,
    category,
    title,
    description,
    recommendation,
  }
}

/**
 * Get severity configuration
 */
export function getSeverityConfig(severity: SecuritySeverity): {
  label: string
  color: string
  bgColor: string
  icon: string
} {
  const configs: Record<SecuritySeverity, ReturnType<typeof getSeverityConfig>> = {
    critical: {
      label: '치명적',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      icon: '🔴',
    },
    high: {
      label: '심각',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      icon: '🟠',
    },
    medium: {
      label: '보통',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      icon: '🟡',
    },
    low: {
      label: '낮음',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      icon: '🔵',
    },
    info: {
      label: '정보',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      icon: 'ℹ️',
    },
  }
  return configs[severity]
}

/**
 * Check if plugin is safe to install
 */
export function isPluginSafeToInstall(
  result: PluginVerificationResult,
  config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG
): { safe: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (!result.canInstall) {
    reasons.push('자동 거부 정책에 의해 설치가 차단되었습니다')
  }

  if (result.riskLevel === 'critical') {
    reasons.push('치명적인 보안 위협이 있습니다')
  }

  if (result.riskLevel === 'high') {
    reasons.push('심각한 보안 이슈가 있습니다')
  }

  if (
    !config.allowUnverifiedDevelopers &&
    result.developer.certificationLevel === 'unverified'
  ) {
    reasons.push('미인증 개발자의 플러그인입니다')
  }

  if (config.requireSignature && !result.signature) {
    reasons.push('코드 서명이 필요하지만 없습니다')
  }

  if (result.verificationStatus === 'failed') {
    reasons.push('검증에 실패했습니다')
  }

  if (result.verificationStatus === 'revoked') {
    reasons.push('검증이 취소되었습니다')
  }

  return {
    safe: reasons.length === 0,
    reasons,
  }
}

/**
 * Generate verification report
 */
export function generateVerificationReport(
  result: PluginVerificationResult
): string {
  const lines: string[] = []

  lines.push(`# 플러그인 검증 보고서`)
  lines.push('')
  lines.push(`## 기본 정보`)
  lines.push(`- **플러그인**: ${result.pluginName} (${result.pluginId})`)
  lines.push(`- **버전**: ${result.version}`)
  lines.push(`- **개발자**: ${result.developer.name} (${CERTIFICATION_LEVELS[result.developer.certificationLevel].label})`)
  lines.push(`- **위험 수준**: ${RISK_LEVELS[result.riskLevel].label}`)
  lines.push(`- **검증 상태**: ${result.verificationStatus}`)
  lines.push('')

  if (result.securityScan) {
    lines.push(`## 보안 스캔 결과`)
    lines.push(`- 스캔 일시: ${result.securityScan.scannedAt}`)
    lines.push(`- 발견된 이슈: ${result.securityScan.summary.total}개`)
    lines.push(`  - 치명적: ${result.securityScan.summary.critical}개`)
    lines.push(`  - 심각: ${result.securityScan.summary.high}개`)
    lines.push(`  - 보통: ${result.securityScan.summary.medium}개`)
    lines.push(`  - 낮음: ${result.securityScan.summary.low}개`)
    lines.push(`  - 정보: ${result.securityScan.summary.info}개`)
    lines.push('')

    if (result.securityScan.findings.length > 0) {
      lines.push(`### 상세 발견 사항`)
      result.securityScan.findings.forEach((finding, i) => {
        lines.push(`${i + 1}. **${finding.title}** (${getSeverityConfig(finding.severity).label})`)
        lines.push(`   - ${finding.description}`)
        lines.push(`   - 권장사항: ${finding.recommendation}`)
      })
      lines.push('')
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`## 경고`)
    result.warnings.forEach((warning) => {
      const icon = warning.severity === 'error' ? '❌' : warning.severity === 'warning' ? '⚠️' : 'ℹ️'
      lines.push(`- ${icon} ${warning.message}`)
    })
    lines.push('')
  }

  if (result.recommendations.length > 0) {
    lines.push(`## 권장사항`)
    result.recommendations.forEach((rec) => {
      lines.push(`- ${rec}`)
    })
    lines.push('')
  }

  lines.push(`## 설치 가능 여부`)
  lines.push(`- 설치 가능: ${result.canInstall ? '예' : '아니오'}`)
  lines.push(`- 승인 필요: ${result.requiresApproval ? '예' : '아니오'}`)

  return lines.join('\n')
}
