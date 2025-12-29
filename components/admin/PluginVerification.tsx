'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  CERTIFICATION_LEVELS,
  RISK_LEVELS,
  SECURITY_CATEGORIES,
  getSeverityConfig,
  isPluginSafeToInstall,
  generateVerificationReport,
  type PluginVerificationResult,
  type SecurityFinding,
  type DeveloperInfo,
  type CertificationLevel,
  type RiskLevel,
  type VerificationConfig,
  DEFAULT_VERIFICATION_CONFIG,
} from '@/lib/plugin/verification'

interface PluginVerificationProps {
  result: PluginVerificationResult
  onInstall?: () => void
  onReject?: () => void
  config?: VerificationConfig
  showFullReport?: boolean
}

export function PluginVerification({
  result,
  onInstall,
  onReject,
  config = DEFAULT_VERIFICATION_CONFIG,
  showFullReport = false,
}: PluginVerificationProps) {
  const [showFindings, setShowFindings] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const safetyCheck = useMemo(
    () => isPluginSafeToInstall(result, config),
    [result, config]
  )

  const report = useMemo(() => generateVerificationReport(result), [result])

  const handleInstall = useCallback(() => {
    if (result.canInstall) {
      onInstall?.()
    }
  }, [result.canInstall, onInstall])

  return (
    <div className="space-y-4">
      {/* Header with risk level */}
      <VerificationHeader result={result} />

      {/* Developer info */}
      <DeveloperCard developer={result.developer} />

      {/* Security scan summary */}
      {result.securityScan && (
        <SecurityScanCard
          scan={result.securityScan}
          showFindings={showFindings}
          onToggleFindings={() => setShowFindings(!showFindings)}
        />
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && <WarningsCard warnings={result.warnings} />}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <RecommendationsCard recommendations={result.recommendations} />
      )}

      {/* Safety status */}
      <SafetyStatus safetyCheck={safetyCheck} result={result} />

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleInstall}
          disabled={!result.canInstall}
          className={`flex-1 rounded-lg py-2 font-medium ${
            result.canInstall
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {result.requiresApproval ? '검토 후 설치' : '설치'}
        </button>
        <button
          onClick={onReject}
          className="rounded-lg border border-gray-600 px-4 py-2 text-gray-300 hover:bg-gray-700"
        >
          취소
        </button>
        {showFullReport && (
          <button
            onClick={() => setShowReport(!showReport)}
            className="rounded-lg border border-gray-600 px-4 py-2 text-gray-300 hover:bg-gray-700"
          >
            {showReport ? '보고서 숨기기' : '전체 보고서'}
          </button>
        )}
      </div>

      {/* Full report */}
      {showReport && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">{report}</pre>
        </div>
      )}
    </div>
  )
}

// Verification header component
function VerificationHeader({ result }: { result: PluginVerificationResult }) {
  const riskConfig = RISK_LEVELS[result.riskLevel]

  return (
    <div
      className={`rounded-lg border p-4 ${riskConfig.bgColor} ${riskConfig.borderColor}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{riskConfig.icon}</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{result.pluginName}</h2>
            <p className="text-sm text-gray-600">v{result.version}</p>
          </div>
        </div>
        <RiskBadge level={result.riskLevel} />
      </div>
      <p className={`mt-2 text-sm ${riskConfig.color}`}>{riskConfig.recommendation}</p>
    </div>
  )
}

// Risk badge component
export function RiskBadge({ level, size = 'md' }: { level: RiskLevel; size?: 'sm' | 'md' }) {
  const config = RISK_LEVELS[level]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span
      className={`rounded-full font-medium ${sizeClasses} ${config.bgColor} ${config.color}`}
    >
      {config.icon} {config.label}
    </span>
  )
}

// Developer card component
function DeveloperCard({ developer }: { developer: DeveloperInfo }) {
  const certConfig = CERTIFICATION_LEVELS[developer.certificationLevel]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${certConfig.bgColor}`}
          >
            <span className={`text-lg ${certConfig.color}`}>{certConfig.icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{developer.name}</span>
              <CertificationBadge level={developer.certificationLevel} />
            </div>
            <p className="text-sm text-gray-400">
              {developer.pluginCount}개 플러그인 · {developer.totalDownloads.toLocaleString()} 다운로드
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">신뢰도</p>
          <p className="font-medium text-white">{developer.reputation}%</p>
        </div>
      </div>

      {/* Badges */}
      {developer.badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {developer.badges.map((badge) => (
            <span
              key={badge.id}
              className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
              title={badge.description}
            >
              {badge.icon} {badge.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Certification badge component
export function CertificationBadge({
  level,
  size = 'sm',
}: {
  level: CertificationLevel
  size?: 'sm' | 'md'
}) {
  const config = CERTIFICATION_LEVELS[level]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span className={`rounded-full font-medium ${sizeClasses} ${config.bgColor} ${config.color}`}>
      {config.icon} {config.label}
    </span>
  )
}

// Security scan card component
function SecurityScanCard({
  scan,
  showFindings,
  onToggleFindings,
}: {
  scan: PluginVerificationResult['securityScan']
  showFindings: boolean
  onToggleFindings: () => void
}) {
  if (!scan) return null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">보안 스캔 결과</h3>
        <span className="text-sm text-gray-400">
          {new Date(scan.scannedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Summary stats */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        <SeverityStat label="치명적" count={scan.summary.critical} severity="critical" />
        <SeverityStat label="심각" count={scan.summary.high} severity="high" />
        <SeverityStat label="보통" count={scan.summary.medium} severity="medium" />
        <SeverityStat label="낮음" count={scan.summary.low} severity="low" />
        <SeverityStat label="정보" count={scan.summary.info} severity="info" />
      </div>

      {/* Toggle findings */}
      {scan.findings.length > 0 && (
        <>
          <button
            onClick={onToggleFindings}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300"
          >
            {showFindings
              ? '상세 결과 숨기기 ▲'
              : `상세 결과 보기 (${scan.findings.length}개) ▼`}
          </button>

          {showFindings && (
            <div className="mt-3 space-y-2">
              {scan.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          )}
        </>
      )}

      {scan.findings.length === 0 && (
        <p className="mt-3 text-sm text-green-400">보안 이슈가 발견되지 않았습니다 ✓</p>
      )}
    </div>
  )
}

// Severity stat component
function SeverityStat({
  label,
  count,
  severity,
}: {
  label: string
  count: number
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
}) {
  const config = getSeverityConfig(severity)

  return (
    <div className={`rounded p-2 text-center ${count > 0 ? config.bgColor : 'bg-gray-700'}`}>
      <p className={`text-lg font-bold ${count > 0 ? config.color : 'text-gray-500'}`}>{count}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

// Finding card component
function FindingCard({ finding }: { finding: SecurityFinding }) {
  const severityConfig = getSeverityConfig(finding.severity)
  const categoryConfig = SECURITY_CATEGORIES[finding.category]

  return (
    <div className="rounded bg-gray-700/50 p-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">{severityConfig.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${severityConfig.color}`}>{finding.title}</span>
            <span className="rounded bg-gray-600 px-1.5 py-0.5 text-xs text-gray-300">
              {categoryConfig.icon} {categoryConfig.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">{finding.description}</p>
          <p className="mt-1 text-sm text-blue-400">💡 {finding.recommendation}</p>
          {finding.location && (
            <p className="mt-1 text-xs text-gray-500">위치: {finding.location}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Warnings card component
function WarningsCard({
  warnings,
}: {
  warnings: PluginVerificationResult['warnings']
}) {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
      <h3 className="font-semibold text-yellow-400">⚠️ 경고</h3>
      <ul className="mt-2 space-y-1">
        {warnings.map((warning, i) => {
          const icon =
            warning.severity === 'error'
              ? '❌'
              : warning.severity === 'warning'
                ? '⚠️'
                : 'ℹ️'
          return (
            <li key={i} className="text-sm text-yellow-200">
              {icon} {warning.message}
              {warning.details && (
                <p className="ml-6 text-xs text-yellow-200/70">{warning.details}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Recommendations card component
function RecommendationsCard({
  recommendations,
}: {
  recommendations: string[]
}) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
      <h3 className="font-semibold text-blue-400">💡 권장사항</h3>
      <ul className="mt-2 space-y-1">
        {recommendations.map((rec, i) => (
          <li key={i} className="text-sm text-blue-200">
            • {rec}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Safety status component
function SafetyStatus({
  safetyCheck,
  result,
}: {
  safetyCheck: ReturnType<typeof isPluginSafeToInstall>
  result: PluginVerificationResult
}) {
  if (safetyCheck.safe) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">✅</span>
          <span className="font-medium text-green-400">
            {result.requiresApproval
              ? '검토 후 설치할 수 있습니다'
              : '안전하게 설치할 수 있습니다'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🚫</span>
        <span className="font-medium text-red-400">설치가 권장되지 않습니다</span>
      </div>
      <ul className="mt-2 space-y-1">
        {safetyCheck.reasons.map((reason, i) => (
          <li key={i} className="text-sm text-red-300">
            • {reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Compact verification badge for list views
export function PluginVerificationBadge({
  result,
}: {
  result: PluginVerificationResult
}) {
  return (
    <div className="flex items-center gap-2">
      <RiskBadge level={result.riskLevel} size="sm" />
      <CertificationBadge level={result.developer.certificationLevel} size="sm" />
    </div>
  )
}

// Simple verification status indicator
export function VerificationStatus({
  status,
}: {
  status: PluginVerificationResult['verificationStatus']
}) {
  const configs = {
    verified: { icon: '✓', color: 'text-green-400', label: '검증됨' },
    unverified: { icon: '?', color: 'text-gray-400', label: '미검증' },
    pending: { icon: '⏳', color: 'text-yellow-400', label: '검증 중' },
    failed: { icon: '✗', color: 'text-red-400', label: '검증 실패' },
    revoked: { icon: '⚠', color: 'text-red-400', label: '취소됨' },
  }

  const config = configs[status]

  return (
    <span className={`inline-flex items-center gap-1 text-sm ${config.color}`}>
      {config.icon} {config.label}
    </span>
  )
}
