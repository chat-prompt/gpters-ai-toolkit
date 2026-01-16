/**
 * Hook Security Validator
 *
 * Comprehensive security validation for Claude Code hooks:
 * - Dangerous command pattern detection
 * - Privilege escalation warnings
 * - Environment variable exposure checks
 * - Safe alternative suggestions
 */

import type { CatalogItem } from '../core/types'
import { createLogger } from '../core/logger'

const log = createLogger('hook-security')

/**
 * Security risk severity levels
 */
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/**
 * Security risk category
 */
export type RiskCategory =
  | 'destructive'      // Commands that delete or modify data irreversibly
  | 'privilege'        // Privilege escalation attempts
  | 'exposure'         // Sensitive data exposure
  | 'network'          // Network-related risks
  | 'execution'        // Arbitrary code execution
  | 'filesystem'       // Filesystem access risks
  | 'injection'        // Command injection vulnerabilities
  | 'resource'         // Resource exhaustion

/**
 * Security risk finding
 */
export interface SecurityRisk {
  /** Unique risk code */
  code: string
  /** Risk category */
  category: RiskCategory
  /** Severity level */
  severity: RiskSeverity
  /** Human-readable description */
  message: string
  /** The matched pattern or content */
  match?: string
  /** Line number if applicable */
  line?: number
  /** Column number if applicable */
  column?: number
  /** Suggested safe alternative */
  suggestion?: string
  /** Reference documentation */
  reference?: string
}

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  /** Whether the hook is considered safe */
  safe: boolean
  /** Overall risk score (0-100, lower is safer) */
  riskScore: number
  /** Risk level classification */
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  /** Individual security findings */
  risks: SecurityRisk[]
  /** Summary statistics */
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
  }
  /** Timestamp */
  timestamp: string
}

/**
 * Dangerous command patterns with metadata
 */
interface DangerousPattern {
  pattern: RegExp
  code: string
  category: RiskCategory
  severity: RiskSeverity
  message: string
  suggestion?: string
  reference?: string
}

/**
 * Dangerous command patterns database
 */
const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // === CRITICAL: Destructive Commands ===
  {
    pattern: /rm\s+(-[^\s]*)?-rf?\s+\/(?!\w)/,
    code: 'DESTRUCTIVE_RM_ROOT',
    category: 'destructive',
    severity: 'critical',
    message: 'Attempts to recursively delete from root directory',
    suggestion: 'Never use rm -rf with root path. Specify exact paths instead.',
    reference: 'https://docs.anthropic.com/en/docs/claude-code/hooks#security',
  },
  {
    pattern: /rm\s+(-[^\s]*)?-rf?\s+~\/?(?!\w)/,
    code: 'DESTRUCTIVE_RM_HOME',
    category: 'destructive',
    severity: 'critical',
    message: 'Attempts to recursively delete home directory',
    suggestion: 'Specify exact subdirectory paths instead of home directory.',
  },
  {
    pattern: /rm\s+(-[^\s]*)?-rf?\s+\$\{?HOME\}?\/?(?!\w)/,
    code: 'DESTRUCTIVE_RM_HOME_VAR',
    category: 'destructive',
    severity: 'critical',
    message: 'Attempts to delete home directory via $HOME variable',
    suggestion: 'Avoid using $HOME with rm -rf. Use specific paths.',
  },
  {
    pattern: /mkfs\./,
    code: 'DESTRUCTIVE_MKFS',
    category: 'destructive',
    severity: 'critical',
    message: 'Filesystem formatting command detected',
    suggestion: 'Remove mkfs commands from hooks.',
  },
  {
    pattern: /dd\s+.*of=\/dev\//,
    code: 'DESTRUCTIVE_DD_DEVICE',
    category: 'destructive',
    severity: 'critical',
    message: 'Direct device write with dd detected',
    suggestion: 'Avoid writing directly to device files.',
  },
  {
    pattern: />\s*\/dev\/sd[a-z]/,
    code: 'DESTRUCTIVE_DEVICE_WRITE',
    category: 'destructive',
    severity: 'critical',
    message: 'Direct write to disk device detected',
    suggestion: 'Never redirect output to disk devices.',
  },

  // === HIGH: Privilege Escalation ===
  {
    pattern: /sudo\s+/,
    code: 'PRIVILEGE_SUDO',
    category: 'privilege',
    severity: 'high',
    message: 'sudo command detected - requires elevated privileges',
    suggestion: 'Avoid sudo in hooks. Run with minimal required permissions.',
  },
  {
    pattern: /su\s+-?\s*\w*/,
    code: 'PRIVILEGE_SU',
    category: 'privilege',
    severity: 'high',
    message: 'su command detected - user switching attempt',
    suggestion: 'Avoid user switching in hooks.',
  },
  {
    pattern: /chmod\s+[0-7]*777/,
    code: 'PRIVILEGE_CHMOD_777',
    category: 'privilege',
    severity: 'high',
    message: 'chmod 777 detected - world-writable permissions',
    suggestion: 'Use minimal permissions (e.g., 755 for directories, 644 for files).',
  },
  {
    pattern: /chmod\s+\+s/,
    code: 'PRIVILEGE_SETUID',
    category: 'privilege',
    severity: 'high',
    message: 'setuid/setgid bit modification detected',
    suggestion: 'Avoid setting setuid/setgid bits in hooks.',
  },
  {
    pattern: /chown\s+root/,
    code: 'PRIVILEGE_CHOWN_ROOT',
    category: 'privilege',
    severity: 'high',
    message: 'Changing ownership to root detected',
    suggestion: 'Avoid changing file ownership to root.',
  },

  // === HIGH: Code Execution ===
  {
    pattern: /eval\s+["'\$`]/,
    code: 'EXECUTION_EVAL',
    category: 'execution',
    severity: 'high',
    message: 'eval with dynamic content detected - potential code injection',
    suggestion: 'Avoid eval. Use direct commands instead.',
  },
  {
    pattern: /\$\([^)]*\$[A-Z_]+[^)]*\)/,
    code: 'EXECUTION_COMMAND_SUBSTITUTION',
    category: 'execution',
    severity: 'medium',
    message: 'Command substitution with environment variable - potential injection',
    suggestion: 'Validate environment variables before use in command substitution.',
  },
  {
    pattern: /`[^`]*\$[A-Z_]+[^`]*`/,
    code: 'EXECUTION_BACKTICK_INJECTION',
    category: 'injection',
    severity: 'medium',
    message: 'Backtick command with environment variable - potential injection',
    suggestion: 'Use $() syntax and validate inputs.',
  },
  {
    pattern: /\|\s*sh\b/,
    code: 'EXECUTION_PIPE_SHELL',
    category: 'execution',
    severity: 'high',
    message: 'Piping to shell detected - arbitrary code execution risk',
    suggestion: 'Avoid piping to sh/bash. Process data directly.',
  },
  {
    pattern: /\|\s*bash\b/,
    code: 'EXECUTION_PIPE_BASH',
    category: 'execution',
    severity: 'high',
    message: 'Piping to bash detected - arbitrary code execution risk',
    suggestion: 'Avoid piping to sh/bash. Process data directly.',
  },
  {
    pattern: /curl\s+[^|]*\|\s*(sh|bash)/,
    code: 'EXECUTION_CURL_PIPE_SHELL',
    category: 'execution',
    severity: 'critical',
    message: 'curl piped to shell - remote code execution risk',
    suggestion: 'Download scripts to file first, review, then execute.',
  },
  {
    pattern: /wget\s+[^|]*\|\s*(sh|bash)/,
    code: 'EXECUTION_WGET_PIPE_SHELL',
    category: 'execution',
    severity: 'critical',
    message: 'wget piped to shell - remote code execution risk',
    suggestion: 'Download scripts to file first, review, then execute.',
  },

  // === MEDIUM: Network Risks ===
  {
    pattern: /curl\s+.*--insecure/,
    code: 'NETWORK_INSECURE_CURL',
    category: 'network',
    severity: 'medium',
    message: 'curl with --insecure flag - SSL verification disabled',
    suggestion: 'Remove --insecure flag. Fix certificate issues properly.',
  },
  {
    pattern: /curl\s+.*-k\b/,
    code: 'NETWORK_INSECURE_CURL_K',
    category: 'network',
    severity: 'medium',
    message: 'curl with -k flag - SSL verification disabled',
    suggestion: 'Remove -k flag. Fix certificate issues properly.',
  },
  {
    pattern: /wget\s+.*--no-check-certificate/,
    code: 'NETWORK_INSECURE_WGET',
    category: 'network',
    severity: 'medium',
    message: 'wget with certificate check disabled',
    suggestion: 'Remove --no-check-certificate. Fix certificate issues properly.',
  },
  {
    pattern: /nc\s+-[^e]*e/,
    code: 'NETWORK_NETCAT_EXEC',
    category: 'network',
    severity: 'high',
    message: 'netcat with execute flag - potential reverse shell',
    suggestion: 'Avoid netcat with -e flag in hooks.',
  },
  {
    pattern: /ncat\s+.*--exec/,
    code: 'NETWORK_NCAT_EXEC',
    category: 'network',
    severity: 'high',
    message: 'ncat with --exec - potential reverse shell',
    suggestion: 'Avoid ncat with --exec in hooks.',
  },

  // === MEDIUM: Sensitive Data Exposure ===
  {
    pattern: /echo\s+.*\$[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY)/i,
    code: 'EXPOSURE_ECHO_SECRET',
    category: 'exposure',
    severity: 'medium',
    message: 'Potentially logging sensitive environment variable',
    suggestion: 'Avoid echoing secrets. Use secure logging practices.',
  },
  {
    pattern: />\s*.*\.(log|txt|out).*\$[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)/i,
    code: 'EXPOSURE_LOG_SECRET',
    category: 'exposure',
    severity: 'medium',
    message: 'Potentially writing secrets to log file',
    suggestion: 'Avoid writing secrets to files. Use secure storage.',
  },
  {
    pattern: /curl\s+.*(-u|--user)\s+[^\s]+:[^\s]+/,
    code: 'EXPOSURE_CURL_CREDENTIALS',
    category: 'exposure',
    severity: 'medium',
    message: 'Hardcoded credentials in curl command',
    suggestion: 'Use environment variables or credential files instead.',
  },
  {
    pattern: /export\s+[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)=/i,
    code: 'EXPOSURE_EXPORT_SECRET',
    category: 'exposure',
    severity: 'low',
    message: 'Exporting potentially sensitive variable',
    suggestion: 'Use .env files or secure secret management.',
  },

  // === MEDIUM: Filesystem Risks ===
  {
    pattern: />\s*\/etc\//,
    code: 'FILESYSTEM_WRITE_ETC',
    category: 'filesystem',
    severity: 'high',
    message: 'Attempting to write to /etc directory',
    suggestion: 'Avoid modifying system configuration in hooks.',
  },
  {
    pattern: />\s*\/usr\//,
    code: 'FILESYSTEM_WRITE_USR',
    category: 'filesystem',
    severity: 'high',
    message: 'Attempting to write to /usr directory',
    suggestion: 'Avoid modifying system directories in hooks.',
  },
  {
    pattern: />\s*\/var\/log\//,
    code: 'FILESYSTEM_WRITE_VARLOG',
    category: 'filesystem',
    severity: 'medium',
    message: 'Attempting to write to system log directory',
    suggestion: 'Use project-local log files instead.',
  },
  {
    pattern: /ln\s+-[^\s]*s?f/,
    code: 'FILESYSTEM_FORCE_SYMLINK',
    category: 'filesystem',
    severity: 'low',
    message: 'Force symlink creation detected',
    suggestion: 'Verify target paths before creating symlinks.',
  },

  // === LOW: Resource Risks ===
  {
    pattern: /while\s+true|for\s*\(\s*;\s*;\s*\)/,
    code: 'RESOURCE_INFINITE_LOOP',
    category: 'resource',
    severity: 'medium',
    message: 'Potential infinite loop detected',
    suggestion: 'Add loop termination conditions or timeouts.',
  },
  {
    pattern: /fork\s*\(\s*\)|:\(\)\{:\|:&\};:/,
    code: 'RESOURCE_FORK_BOMB',
    category: 'resource',
    severity: 'critical',
    message: 'Fork bomb pattern detected',
    suggestion: 'Remove fork bomb code immediately.',
  },
  {
    pattern: />\s*\/dev\/null\s+2>&1\s*&$/,
    code: 'RESOURCE_BACKGROUND_SILENT',
    category: 'resource',
    severity: 'low',
    message: 'Silent background process - may be hard to monitor',
    suggestion: 'Consider logging background process output.',
  },

  // === LOW: Injection Risks ===
  {
    pattern: /\$\{[^}]*:-[^}]*\}/,
    code: 'INJECTION_DEFAULT_VALUE',
    category: 'injection',
    severity: 'info',
    message: 'Shell parameter expansion with default value',
    suggestion: 'Ensure default values are safe and validated.',
  },
  {
    pattern: /xargs\s+.*-I/,
    code: 'INJECTION_XARGS',
    category: 'injection',
    severity: 'low',
    message: 'xargs with replacement - potential injection if input is untrusted',
    suggestion: 'Validate input before passing to xargs.',
  },
]

/**
 * Sensitive environment variable patterns
 */
const SENSITIVE_ENV_PATTERNS = [
  /^[A-Z_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|PRIVATE).*$/i,
  /^(?:AWS|AZURE|GCP|GOOGLE)_.*$/i,
  /^(?:DATABASE|DB|MONGO|REDIS|MYSQL|POSTGRES)_.*(?:PASSWORD|URL|URI).*$/i,
  /^(?:GITHUB|GITLAB|BITBUCKET)_.*TOKEN.*$/i,
  /^NPM_TOKEN$/i,
  /^DOCKER_.*(?:PASSWORD|TOKEN).*$/i,
]

/**
 * Check if an environment variable name is sensitive
 */
export function isSensitiveEnvVar(name: string): boolean {
  return SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Extract environment variable references from command
 */
function extractEnvVarReferences(command: string): string[] {
  const pattern = /\$\{?([A-Z_][A-Z0-9_]*)\}?/g
  const matches: string[] = []
  let match

  while ((match = pattern.exec(command)) !== null) {
    matches.push(match[1])
  }

  return [...new Set(matches)]
}

/**
 * Check for sensitive environment variable exposure
 */
function checkEnvVarExposure(command: string): SecurityRisk[] {
  const risks: SecurityRisk[] = []
  const envVars = extractEnvVarReferences(command)

  for (const varName of envVars) {
    if (isSensitiveEnvVar(varName)) {
      // Check if it's being logged/echoed
      const isLogged = /echo|printf|cat|tee|>/.test(command)
      const isSentNetwork = /curl|wget|nc|ncat|http/.test(command)

      if (isLogged) {
        risks.push({
          code: 'EXPOSURE_SENSITIVE_VAR_LOG',
          category: 'exposure',
          severity: 'medium',
          message: `Sensitive variable $${varName} may be logged or written to file`,
          match: varName,
          suggestion: `Avoid logging $${varName}. Mask sensitive values in output.`,
        })
      }

      if (isSentNetwork) {
        risks.push({
          code: 'EXPOSURE_SENSITIVE_VAR_NETWORK',
          category: 'exposure',
          severity: 'high',
          message: `Sensitive variable $${varName} may be sent over network`,
          match: varName,
          suggestion: `Review if $${varName} needs to be transmitted. Use secure channels.`,
        })
      }
    }
  }

  return risks
}

/**
 * Check for command injection vulnerabilities
 */
function checkCommandInjection(command: string): SecurityRisk[] {
  const risks: SecurityRisk[] = []

  // Check for unquoted variable expansion in dangerous contexts
  const unquotedVarInRm = /rm\s+[^"']*\$[A-Z_]+[^"']*/
  if (unquotedVarInRm.test(command)) {
    risks.push({
      code: 'INJECTION_UNQUOTED_RM',
      category: 'injection',
      severity: 'high',
      message: 'Unquoted variable in rm command - potential path injection',
      suggestion: 'Always quote variables: rm "$VAR" instead of rm $VAR',
    })
  }

  // Check for unquoted variable in path operations
  const unquotedVarInPath = /(?:cd|mv|cp|ln)\s+[^"']*\$[A-Z_]+[^"']*/
  if (unquotedVarInPath.test(command)) {
    risks.push({
      code: 'INJECTION_UNQUOTED_PATH',
      category: 'injection',
      severity: 'medium',
      message: 'Unquoted variable in path operation - potential injection',
      suggestion: 'Always quote variables in path operations.',
    })
  }

  return risks
}

/**
 * Calculate risk score from findings
 */
function calculateRiskScore(risks: SecurityRisk[]): number {
  const severityWeights: Record<RiskSeverity, number> = {
    critical: 40,
    high: 25,
    medium: 15,
    low: 5,
    info: 1,
  }

  let score = 0
  for (const risk of risks) {
    score += severityWeights[risk.severity]
  }

  return Math.min(100, score)
}

/**
 * Get risk level from score
 */
function getRiskLevel(score: number): SecurityValidationResult['riskLevel'] {
  if (score === 0) return 'safe'
  if (score < 20) return 'low'
  if (score < 50) return 'medium'
  if (score < 80) return 'high'
  return 'critical'
}

/**
 * Validate hook command for security risks
 */
export function validateHookSecurity(command: string): SecurityValidationResult {
  log.info('Validating hook security', { commandLength: command.length })

  const risks: SecurityRisk[] = []

  // Check against dangerous patterns
  for (const dangerous of DANGEROUS_PATTERNS) {
    const match = command.match(dangerous.pattern)
    if (match) {
      risks.push({
        code: dangerous.code,
        category: dangerous.category,
        severity: dangerous.severity,
        message: dangerous.message,
        match: match[0],
        suggestion: dangerous.suggestion,
        reference: dangerous.reference,
      })
    }
  }

  // Check for sensitive environment variable exposure
  risks.push(...checkEnvVarExposure(command))

  // Check for command injection vulnerabilities
  risks.push(...checkCommandInjection(command))

  // Calculate summary
  const summary = {
    critical: risks.filter((r) => r.severity === 'critical').length,
    high: risks.filter((r) => r.severity === 'high').length,
    medium: risks.filter((r) => r.severity === 'medium').length,
    low: risks.filter((r) => r.severity === 'low').length,
    info: risks.filter((r) => r.severity === 'info').length,
    total: risks.length,
  }

  const riskScore = calculateRiskScore(risks)
  const riskLevel = getRiskLevel(riskScore)

  const result: SecurityValidationResult = {
    safe: summary.critical === 0 && summary.high === 0,
    riskScore,
    riskLevel,
    risks,
    summary,
    timestamp: new Date().toISOString(),
  }

  log.info('Security validation complete', {
    riskScore,
    riskLevel,
    totalRisks: summary.total,
  })

  return result
}

/**
 * Validate a CatalogItem hook for security
 */
export function validateHookItemSecurity(item: Partial<CatalogItem>): SecurityValidationResult {
  if (!item.hookCommand) {
    return {
      safe: true,
      riskScore: 0,
      riskLevel: 'safe',
      risks: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      timestamp: new Date().toISOString(),
    }
  }

  return validateHookSecurity(item.hookCommand)
}

/**
 * Get safe alternative for a risky command pattern
 */
export function getSafeAlternative(riskCode: string): string | undefined {
  const pattern = DANGEROUS_PATTERNS.find((p) => p.code === riskCode)
  return pattern?.suggestion
}

/**
 * Get all security rules
 */
export function getSecurityRules(): Array<{
  code: string
  category: RiskCategory
  severity: RiskSeverity
  description: string
}> {
  return DANGEROUS_PATTERNS.map((p) => ({
    code: p.code,
    category: p.category,
    severity: p.severity,
    description: p.message,
  }))
}

/**
 * Generate a security report in markdown format
 */
export function generateSecurityReport(result: SecurityValidationResult): string {
  const lines: string[] = []

  const statusIcon = result.safe ? '✅' : result.riskLevel === 'critical' ? '🚨' : '⚠️'

  lines.push('# Hook Security Report')
  lines.push('')
  lines.push(`**Status:** ${statusIcon} ${result.riskLevel.toUpperCase()}`)
  lines.push(`**Risk Score:** ${result.riskScore}/100`)
  lines.push(`**Time:** ${result.timestamp}`)
  lines.push('')

  // Summary
  lines.push('## Summary')
  lines.push('')
  lines.push('| Severity | Count |')
  lines.push('|----------|-------|')
  lines.push(`| 🚨 Critical | ${result.summary.critical} |`)
  lines.push(`| 🔴 High | ${result.summary.high} |`)
  lines.push(`| 🟠 Medium | ${result.summary.medium} |`)
  lines.push(`| 🟡 Low | ${result.summary.low} |`)
  lines.push(`| ℹ️ Info | ${result.summary.info} |`)
  lines.push('')

  if (result.risks.length === 0) {
    lines.push('## Findings')
    lines.push('')
    lines.push('✅ No security risks detected.')
    lines.push('')
  } else {
    // Group risks by category
    const byCategory = result.risks.reduce(
      (acc, risk) => {
        if (!acc[risk.category]) acc[risk.category] = []
        acc[risk.category].push(risk)
        return acc
      },
      {} as Record<RiskCategory, SecurityRisk[]>
    )

    lines.push('## Findings')
    lines.push('')

    const categoryLabels: Record<RiskCategory, string> = {
      destructive: '💥 Destructive Commands',
      privilege: '🔐 Privilege Escalation',
      exposure: '👁️ Data Exposure',
      network: '🌐 Network Risks',
      execution: '⚡ Code Execution',
      filesystem: '📁 Filesystem Risks',
      injection: '💉 Injection Vulnerabilities',
      resource: '📊 Resource Risks',
    }

    for (const [category, categoryRisks] of Object.entries(byCategory)) {
      lines.push(`### ${categoryLabels[category as RiskCategory]}`)
      lines.push('')

      for (const risk of categoryRisks) {
        const severityIcon =
          risk.severity === 'critical'
            ? '🚨'
            : risk.severity === 'high'
              ? '🔴'
              : risk.severity === 'medium'
                ? '🟠'
                : risk.severity === 'low'
                  ? '🟡'
                  : 'ℹ️'

        lines.push(`#### ${severityIcon} ${risk.code}`)
        lines.push('')
        lines.push(`**${risk.message}**`)
        lines.push('')
        if (risk.match) {
          lines.push(`- **Matched:** \`${risk.match}\``)
        }
        if (risk.suggestion) {
          lines.push(`- **Suggestion:** ${risk.suggestion}`)
        }
        if (risk.reference) {
          lines.push(`- **Reference:** [Documentation](${risk.reference})`)
        }
        lines.push('')
      }
    }
  }

  // Recommendations
  if (!result.safe) {
    lines.push('## Recommendations')
    lines.push('')

    if (result.summary.critical > 0) {
      lines.push('1. **CRITICAL:** Address all critical issues before using this hook.')
    }
    if (result.summary.high > 0) {
      lines.push('2. **HIGH:** Review and fix high-severity issues.')
    }
    lines.push('3. Test hooks in a safe environment before production use.')
    lines.push('4. Consider using the hook simulator to verify behavior.')
    lines.push('')
  }

  return lines.join('\n')
}
