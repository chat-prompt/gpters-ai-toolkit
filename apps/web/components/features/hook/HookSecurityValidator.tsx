/**
 * Hook security validator component
 *
 * Interactive UI for validating hook command security with
 * risk scoring, severity badges, and safe alternative suggestions.
 */
'use client'

import { useState, useCallback } from 'react'
import {
  validateHookSecurity,
  getSecurityRules,
  generateSecurityReport,
  getSafeAlternative,
  type SecurityValidationResult,
  type SecurityRisk,
  type RiskSeverity,
  type RiskCategory,
} from '@/lib/plugin/hook-security'
import { cn } from '@/lib/utils'

/** Props for HookSecurityValidator component */
interface HookSecurityValidatorProps {
  /** Pre-filled command to validate */
  initialCommand?: string
  /** Callback when validation completes */
  onValidationComplete?: (result: SecurityValidationResult) => void
  /** Whether to show security rules reference table */
  showRules?: boolean
  /** Additional CSS classes */
  className?: string
}

const SEVERITY_CONFIG: Record<RiskSeverity, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100' },
  high: { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  medium: { label: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  low: { label: 'Low', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  info: { label: 'Info', color: 'text-gray-700', bgColor: 'bg-gray-100' },
}

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  destructive: '파괴적 작업',
  privilege: '권한 상승',
  exposure: '정보 노출',
  network: '네트워크',
  execution: '코드 실행',
  filesystem: '파일시스템',
  injection: '인젝션',
  resource: '리소스',
}

/**
 * Hook command security validator
 *
 * Analyzes shell commands for security risks and provides:
 * - Risk scoring with severity levels
 * - Categorized security warnings
 * - Safe alternative suggestions
 * - Optional security rules reference
 */
export function HookSecurityValidator({
  initialCommand = '',
  onValidationComplete,
  showRules = false,
  className,
}: HookSecurityValidatorProps) {
  const [command, setCommand] = useState(initialCommand)
  const [result, setResult] = useState<SecurityValidationResult | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [rulesExpanded, setRulesExpanded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<RiskCategory | 'all'>('all')

  const handleValidate = useCallback(() => {
    if (!command.trim()) return

    const validationResult = validateHookSecurity(command)
    setResult(validationResult)
    onValidationComplete?.(validationResult)
  }, [command, onValidationComplete])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleValidate()
    }
  }

  const rules = getSecurityRules()
  const filteredRules = selectedCategory === 'all'
    ? rules
    : rules.filter((r) => r.category === selectedCategory)

  return (
    <div className={cn('space-y-6', className)}>
      {/* Command Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Hook 명령어
        </label>
        <div className="flex gap-2">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='echo "Hello World" 또는 복잡한 쉘 명령어 입력...'
            className="flex-1 min-h-[80px] p-3 font-mono text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleValidate}
            disabled={!command.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-start"
          >
            보안 검사
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Cmd/Ctrl + Enter로 빠른 검사
        </p>
      </div>

      {/* Validation Result */}
      {result && (
        <div className="space-y-4">
          {/* Score Display */}
          <div className={cn(
            'p-4 rounded-lg border-2',
            result.safe
              ? 'border-green-300 bg-green-50'
              : result.riskLevel === 'critical'
                ? 'border-red-300 bg-red-50'
                : result.riskLevel === 'high'
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-yellow-300 bg-yellow-50'
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'text-3xl font-bold',
                  result.riskScore >= 80 ? 'text-green-600' :
                  result.riskScore >= 60 ? 'text-yellow-600' :
                  result.riskScore >= 40 ? 'text-orange-600' : 'text-red-600'
                )}>
                  {result.riskScore}
                </div>
                <div>
                  <div className="font-semibold">
                    {result.safe ? '✅ 안전' : '⚠️ 위험 감지'}
                  </div>
                  <div className="text-sm text-gray-600">
                    위험 수준: {result.riskLevel.toUpperCase()}
                  </div>
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                {result.risks.length}개 위험 요소
              </div>
            </div>
          </div>

          {/* Risks List */}
          {result.risks.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-800">감지된 위험</h3>
              <div className="space-y-2">
                {result.risks.map((risk, index) => (
                  <RiskCard key={index} risk={risk} />
                ))}
              </div>
            </div>
          )}

          {/* Report Toggle */}
          <div className="pt-2 border-t">
            <button
              onClick={() => setShowReport(!showReport)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showReport ? '보고서 숨기기' : '전체 보고서 보기'}
            </button>
            {showReport && (
              <pre className="mt-2 p-4 bg-gray-50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                {generateSecurityReport(result)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Security Rules Reference */}
      {showRules && (
        <div className="border-t pt-4">
          <button
            onClick={() => setRulesExpanded(!rulesExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span>{rulesExpanded ? '▼' : '▶'}</span>
            보안 규칙 참조 ({rules.length}개)
          </button>

          {rulesExpanded && (
            <div className="mt-4 space-y-3">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    'px-2 py-1 text-xs rounded',
                    selectedCategory === 'all'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  전체
                </button>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key as RiskCategory)}
                    className={cn(
                      'px-2 py-1 text-xs rounded',
                      selectedCategory === key
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Rules Table */}
              <div className="overflow-hidden border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">코드</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">심각도</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">카테고리</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">설명</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRules.map((rule) => (
                      <tr key={rule.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{rule.code}</td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'px-2 py-0.5 rounded text-xs',
                            SEVERITY_CONFIG[rule.severity].bgColor,
                            SEVERITY_CONFIG[rule.severity].color
                          )}>
                            {SEVERITY_CONFIG[rule.severity].label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {CATEGORY_LABELS[rule.category]}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{rule.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Props for RiskCard component */
interface RiskCardProps {
  /** Security risk to display */
  risk: SecurityRisk
}

/** Individual security risk card with expandable details */
function RiskCard({ risk }: RiskCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = SEVERITY_CONFIG[risk.severity]
  const safeAlternative = getSafeAlternative(risk.code)

  return (
    <div className={cn(
      'p-3 rounded-lg border',
      config.bgColor,
      'border-opacity-50'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              config.bgColor,
              config.color
            )}>
              {config.label}
            </span>
            <span className="text-xs text-gray-500 font-mono">{risk.code}</span>
            <span className="text-xs text-gray-400">
              {CATEGORY_LABELS[risk.category]}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-800">{risk.message}</p>
          {risk.match && (
            <p className="mt-1 text-xs text-gray-500">
              매칭: <code className="bg-white/50 px-1 rounded">{risk.match}</code>
            </p>
          )}
        </div>
        {safeAlternative && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:underline whitespace-nowrap"
          >
            {expanded ? '숨기기' : '대안 보기'}
          </button>
        )}
      </div>
      {expanded && safeAlternative && (
        <div className="mt-2 p-2 bg-white/50 rounded text-sm">
          <strong className="text-green-700">안전한 대안:</strong>
          <p className="mt-1 text-gray-700">{safeAlternative}</p>
        </div>
      )}
    </div>
  )
}

export default HookSecurityValidator
