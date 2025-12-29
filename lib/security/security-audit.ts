/**
 * Security Audit Library for GPTers AI Toolkit
 *
 * Provides security analysis functions to scan catalog items
 * (skills, agents, commands, hooks) for potential security issues.
 */

import type { CatalogItem } from '../core/types'
import { createLogger } from '../core/logger'

const log = createLogger('security-audit')

// Risk levels for security issues
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

// Security issue categories
export type IssueCategory =
  | 'shell_injection'
  | 'code_execution'
  | 'file_system'
  | 'network'
  | 'credential_exposure'
  | 'xss'
  | 'dangerous_pattern'

// Individual security issue found during audit
export interface SecurityIssue {
  id: string
  category: IssueCategory
  riskLevel: RiskLevel
  title: string
  description: string
  location?: string // e.g., "content", "hookCommand", "files[0]"
  lineNumber?: number
  matchedPattern: string
  recommendation: string
}

// Complete audit result for an item
export interface SecurityAuditResult {
  itemId: string
  itemName: string
  itemType: string
  auditedAt: string
  overallRisk: RiskLevel
  issues: SecurityIssue[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  passed: boolean
}

// Pattern definition for detection
interface SecurityPattern {
  id: string
  category: IssueCategory
  riskLevel: RiskLevel
  pattern: RegExp
  title: string
  description: string
  recommendation: string
}

// Security patterns to detect
const SECURITY_PATTERNS: SecurityPattern[] = [
  // Shell Command Injection
  {
    id: 'shell-exec',
    category: 'shell_injection',
    riskLevel: 'critical',
    pattern: /\b(exec|execSync|spawn|spawnSync|fork)\s*\(/gi,
    title: 'Shell Command Execution',
    description: 'Direct shell command execution detected. This can lead to command injection if user input is not properly sanitized.',
    recommendation: 'Use parameterized commands or input validation. Consider using safer alternatives like specific API calls.',
  },
  {
    id: 'shell-system',
    category: 'shell_injection',
    riskLevel: 'critical',
    pattern: /\b(system|popen|subprocess\.run|subprocess\.call|os\.system)\s*\(/gi,
    title: 'System Command Execution',
    description: 'System-level command execution detected which can be exploited for command injection.',
    recommendation: 'Avoid direct system calls. Use language-specific safe APIs for the required functionality.',
  },
  {
    id: 'shell-backtick',
    category: 'shell_injection',
    riskLevel: 'high',
    pattern: /`[^`]*\$[^`]*`/g,
    title: 'Shell Variable in Backticks',
    description: 'Shell command with variable interpolation detected. This may be vulnerable to injection attacks.',
    recommendation: 'Use proper escaping or parameterized commands instead of variable interpolation in shell commands.',
  },
  {
    id: 'shell-eval-sh',
    category: 'shell_injection',
    riskLevel: 'critical',
    pattern: /\beval\s+["']?\$|sh\s+-c\s+["']?\$/gi,
    title: 'Dynamic Shell Evaluation',
    description: 'Dynamic shell command evaluation with variable expansion detected.',
    recommendation: 'Never use eval with user-controlled input. Restructure to use static commands.',
  },

  // Dangerous Eval Patterns
  {
    id: 'js-eval',
    category: 'code_execution',
    riskLevel: 'critical',
    pattern: /\beval\s*\(/gi,
    title: 'JavaScript eval() Usage',
    description: 'Usage of eval() detected which can execute arbitrary code and is a major security risk.',
    recommendation: 'Replace eval() with JSON.parse() for JSON data or use safer alternatives like Function constructors with proper input validation.',
  },
  {
    id: 'js-function-constructor',
    category: 'code_execution',
    riskLevel: 'high',
    pattern: /new\s+Function\s*\(/gi,
    title: 'Function Constructor Usage',
    description: 'Dynamic function creation detected. Similar to eval(), this can execute arbitrary code.',
    recommendation: 'Avoid dynamic code generation. Use predefined functions or a safe templating approach.',
  },
  {
    id: 'js-settimeout-string',
    category: 'code_execution',
    riskLevel: 'medium',
    pattern: /setTimeout\s*\(\s*["'`]/gi,
    title: 'setTimeout with String Argument',
    description: 'setTimeout with a string argument works like eval() and can execute arbitrary code.',
    recommendation: 'Always pass a function reference to setTimeout, not a string.',
  },
  {
    id: 'python-exec',
    category: 'code_execution',
    riskLevel: 'critical',
    pattern: /\b(compile)\s*\(/gi,
    title: 'Python Dynamic Code Execution',
    description: 'Python compile() detected which can execute arbitrary code.',
    recommendation: 'Avoid dynamic code execution. Use structured data and explicit logic instead.',
  },

  // File System Operations
  {
    id: 'fs-unlink',
    category: 'file_system',
    riskLevel: 'high',
    pattern: /\b(unlink|unlinkSync|rmdir|rmdirSync|rm\s+-rf|rimraf)\b/gi,
    title: 'File/Directory Deletion',
    description: 'File or directory deletion operation detected. This could be dangerous if paths are not validated.',
    recommendation: 'Validate paths against an allowlist and ensure no path traversal is possible.',
  },
  {
    id: 'fs-write',
    category: 'file_system',
    riskLevel: 'medium',
    pattern: /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\s*\(/gi,
    title: 'File Write Operation',
    description: 'File write operation detected. Ensure proper path validation and access control.',
    recommendation: 'Validate file paths against allowed directories and sanitize filenames.',
  },
  {
    id: 'path-traversal',
    category: 'file_system',
    riskLevel: 'high',
    pattern: /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\//gi,
    title: 'Path Traversal Pattern',
    description: 'Path traversal pattern detected which could allow access to files outside intended directories.',
    recommendation: 'Use path normalization and validate that resolved paths are within allowed directories.',
  },
  {
    id: 'absolute-path',
    category: 'file_system',
    riskLevel: 'medium',
    pattern: /["'`](\/etc\/|\/var\/|\/usr\/|\/root\/|C:\\|\/home\/)/gi,
    title: 'Absolute Path Reference',
    description: 'Hardcoded absolute path detected which may indicate unauthorized file access attempts.',
    recommendation: 'Use relative paths from a safe base directory instead of absolute paths.',
  },

  // Network Requests
  {
    id: 'external-url',
    category: 'network',
    riskLevel: 'medium',
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-zA-Z0-9.-]+/gi,
    title: 'External URL Reference',
    description: 'External URL detected. Verify the domain is trusted and necessary for functionality.',
    recommendation: 'Use an allowlist of approved domains and validate URLs before making requests.',
  },
  {
    id: 'dynamic-url',
    category: 'network',
    riskLevel: 'high',
    pattern: /fetch\s*\(\s*[`$]|axios\s*\.\s*\w+\s*\(\s*[`$]|request\s*\(\s*[`$]/gi,
    title: 'Dynamic URL Construction',
    description: 'Dynamic URL construction in network request detected. This could lead to SSRF vulnerabilities.',
    recommendation: 'Validate and sanitize URL components. Use allowlisted hosts only.',
  },
  {
    id: 'websocket',
    category: 'network',
    riskLevel: 'low',
    pattern: /new\s+WebSocket\s*\(/gi,
    title: 'WebSocket Connection',
    description: 'WebSocket connection detected. Ensure the connection is to trusted endpoints only.',
    recommendation: 'Validate WebSocket URLs against an allowlist of trusted endpoints.',
  },

  // Credential Exposure
  {
    id: 'hardcoded-secret',
    category: 'credential_exposure',
    riskLevel: 'critical',
    pattern: /(password|secret|api_key|apikey|token|auth|credential)\s*[:=]\s*["'][^"']{8,}["']/gi,
    title: 'Hardcoded Secret/Credential',
    description: 'Potential hardcoded secret or credential detected. This is a severe security risk.',
    recommendation: 'Use environment variables or a secure secret management system instead of hardcoding credentials.',
  },
  {
    id: 'aws-key',
    category: 'credential_exposure',
    riskLevel: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/g,
    title: 'AWS Access Key ID',
    description: 'Potential AWS Access Key ID detected in code.',
    recommendation: 'Remove AWS credentials from code and use IAM roles or environment variables.',
  },
  {
    id: 'private-key',
    category: 'credential_exposure',
    riskLevel: 'critical',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
    title: 'Private Key Detected',
    description: 'Private key material detected in content. This is a critical security vulnerability.',
    recommendation: 'Never include private keys in code. Use secure key management and file references.',
  },
  {
    id: 'env-exposure',
    category: 'credential_exposure',
    riskLevel: 'medium',
    pattern: /process\.env\.\w+/gi,
    title: 'Environment Variable Access',
    description: 'Environment variable access detected. Ensure sensitive values are not logged or exposed.',
    recommendation: 'Audit environment variable usage to prevent accidental exposure of secrets.',
  },

  // XSS Vulnerabilities
  {
    id: 'innerhtml',
    category: 'xss',
    riskLevel: 'high',
    pattern: /\.innerHTML\s*=|dangerouslySetInnerHTML/gi,
    title: 'Direct HTML Injection',
    description: 'Direct HTML injection detected which can lead to XSS vulnerabilities.',
    recommendation: 'Use safe DOM manipulation methods or sanitize HTML content before insertion.',
  },
  {
    id: 'document-write',
    category: 'xss',
    riskLevel: 'high',
    pattern: /document\.write\s*\(/gi,
    title: 'document.write() Usage',
    description: 'document.write() usage detected which can be exploited for XSS attacks.',
    recommendation: 'Use modern DOM manipulation methods instead of document.write().',
  },
  {
    id: 'js-url',
    category: 'xss',
    riskLevel: 'high',
    pattern: /javascript:\s*[^"'\s]/gi,
    title: 'JavaScript Protocol in URL',
    description: 'JavaScript protocol in URL detected which is a common XSS vector.',
    recommendation: 'Sanitize URLs and reject javascript: protocol URLs.',
  },

  // Other Dangerous Patterns
  {
    id: 'sudo',
    category: 'dangerous_pattern',
    riskLevel: 'critical',
    pattern: /\bsudo\s+/gi,
    title: 'Sudo Command Usage',
    description: 'Sudo command detected which requires elevated privileges.',
    recommendation: 'Avoid requiring sudo. Design commands to work within normal user permissions.',
  },
  {
    id: 'chmod-777',
    category: 'dangerous_pattern',
    riskLevel: 'high',
    pattern: /chmod\s+777|chmod\s+\+x.*777/gi,
    title: 'Insecure Permission Setting',
    description: 'Setting file permissions to 777 (world-writable) is a security risk.',
    recommendation: 'Use minimum necessary permissions. Prefer 755 for executables and 644 for files.',
  },
  {
    id: 'curl-pipe-sh',
    category: 'dangerous_pattern',
    riskLevel: 'critical',
    pattern: /curl.*\|\s*(ba)?sh|wget.*\|\s*(ba)?sh/gi,
    title: 'Remote Script Execution',
    description: 'Downloading and executing remote scripts directly is extremely dangerous.',
    recommendation: 'Download scripts first, verify their content, then execute separately.',
  },
  {
    id: 'disable-ssl',
    category: 'dangerous_pattern',
    riskLevel: 'high',
    pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False|--insecure\b|-k\b/gi,
    title: 'SSL/TLS Verification Disabled',
    description: 'SSL/TLS certificate verification is disabled, making connections vulnerable to MITM attacks.',
    recommendation: 'Enable SSL verification and use proper certificates.',
  },
]

// Risk level priority for comparison
const RISK_PRIORITY: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

// Category labels for display
export const CATEGORY_LABELS: Record<IssueCategory, { label: string; icon: string }> = {
  shell_injection: { label: 'Shell Injection', icon: '🐚' },
  code_execution: { label: 'Code Execution', icon: '⚡' },
  file_system: { label: 'File System', icon: '📁' },
  network: { label: 'Network', icon: '🌐' },
  credential_exposure: { label: 'Credential Exposure', icon: '🔑' },
  xss: { label: 'XSS', icon: '🕷️' },
  dangerous_pattern: { label: 'Dangerous Pattern', icon: '⚠️' },
}

// Risk level labels for display
export const RISK_LABELS: Record<RiskLevel, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  medium: { label: 'Medium', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  high: { label: 'High', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  critical: { label: 'Critical', color: 'text-red-400', bgColor: 'bg-red-500/20' },
}

/**
 * Find the line number where a match occurs in content
 */
function findLineNumber(content: string, match: string): number | undefined {
  const index = content.indexOf(match)
  if (index === -1) return undefined
  return content.substring(0, index).split('\n').length
}

/**
 * Scan content for a specific pattern
 */
function scanForPattern(
  content: string,
  pattern: SecurityPattern,
  location: string
): SecurityIssue[] {
  const issues: SecurityIssue[] = []
  const matches = content.match(pattern.pattern)

  if (matches) {
    // Use Set to avoid duplicate matches
    const uniqueMatches = [...new Set(matches)]
    uniqueMatches.forEach((match, index) => {
      issues.push({
        id: `${pattern.id}-${location}-${index}`,
        category: pattern.category,
        riskLevel: pattern.riskLevel,
        title: pattern.title,
        description: pattern.description,
        location,
        lineNumber: findLineNumber(content, match),
        matchedPattern: match.substring(0, 100) + (match.length > 100 ? '...' : ''),
        recommendation: pattern.recommendation,
      })
    })
  }

  return issues
}

/**
 * Scan all content fields of a catalog item
 */
function scanItemContent(item: CatalogItem): SecurityIssue[] {
  const issues: SecurityIssue[] = []

  // Scan main content
  if (item.content) {
    SECURITY_PATTERNS.forEach((pattern) => {
      issues.push(...scanForPattern(item.content, pattern, 'content'))
    })
  }

  // Scan README
  if (item.readme) {
    const readme = item.readme
    SECURITY_PATTERNS.forEach((pattern) => {
      issues.push(...scanForPattern(readme, pattern, 'readme'))
    })
  }

  // Scan hook command (especially important for hooks)
  if (item.hookCommand) {
    const hookCommand = item.hookCommand
    SECURITY_PATTERNS.forEach((pattern) => {
      issues.push(...scanForPattern(hookCommand, pattern, 'hookCommand'))
    })
  }

  // Scan additional files
  if (item.files && Array.isArray(item.files)) {
    item.files.forEach((file, index) => {
      if (file.content) {
        SECURITY_PATTERNS.forEach((pattern) => {
          issues.push(...scanForPattern(file.content, pattern, `files[${index}]: ${file.name}`))
        })
      }
    })
  }

  return issues
}

/**
 * Calculate the overall risk level based on found issues
 */
function calculateOverallRisk(issues: SecurityIssue[]): RiskLevel {
  if (issues.length === 0) return 'low'

  // Find the highest risk level
  let maxRisk: RiskLevel = 'low'
  for (const issue of issues) {
    if (RISK_PRIORITY[issue.riskLevel] > RISK_PRIORITY[maxRisk]) {
      maxRisk = issue.riskLevel
    }
  }

  return maxRisk
}

/**
 * Perform a security audit on a catalog item
 */
export function auditCatalogItem(item: CatalogItem): SecurityAuditResult {
  log.info('Starting security audit', { itemId: item.id, itemType: item.type })

  const issues = scanItemContent(item)

  const summary = {
    total: issues.length,
    critical: issues.filter((i) => i.riskLevel === 'critical').length,
    high: issues.filter((i) => i.riskLevel === 'high').length,
    medium: issues.filter((i) => i.riskLevel === 'medium').length,
    low: issues.filter((i) => i.riskLevel === 'low').length,
  }

  const overallRisk = calculateOverallRisk(issues)
  const passed = summary.critical === 0 && summary.high === 0

  log.info('Security audit completed', {
    itemId: item.id,
    totalIssues: summary.total,
    overallRisk,
    passed,
  })

  return {
    itemId: item.id,
    itemName: item.name,
    itemType: item.type,
    auditedAt: new Date().toISOString(),
    overallRisk,
    issues,
    summary,
    passed,
  }
}

/**
 * Perform security audit on raw content (for preview/validation)
 */
export function auditContent(
  content: string,
  location: string = 'content'
): SecurityIssue[] {
  const issues: SecurityIssue[] = []

  SECURITY_PATTERNS.forEach((pattern) => {
    issues.push(...scanForPattern(content, pattern, location))
  })

  return issues
}

/**
 * Quick check if content has any security issues
 */
export function hasSecurityIssues(content: string): boolean {
  return SECURITY_PATTERNS.some((pattern) => pattern.pattern.test(content))
}

/**
 * Get issues by risk level
 */
export function getIssuesByRisk(
  issues: SecurityIssue[],
  minRisk: RiskLevel = 'low'
): SecurityIssue[] {
  const minPriority = RISK_PRIORITY[minRisk]
  return issues.filter((issue) => RISK_PRIORITY[issue.riskLevel] >= minPriority)
}

/**
 * Get issues by category
 */
export function getIssuesByCategory(
  issues: SecurityIssue[],
  category: IssueCategory
): SecurityIssue[] {
  return issues.filter((issue) => issue.category === category)
}

/**
 * Compare risk levels
 */
export function compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
  return RISK_PRIORITY[a] - RISK_PRIORITY[b]
}

/**
 * Sort issues by risk level (highest first)
 */
export function sortIssuesByRisk(issues: SecurityIssue[]): SecurityIssue[] {
  return [...issues].sort(
    (a, b) => RISK_PRIORITY[b.riskLevel] - RISK_PRIORITY[a.riskLevel]
  )
}

/**
 * Get available security patterns (for documentation/testing)
 */
export function getSecurityPatterns(): Omit<SecurityPattern, 'pattern'>[] {
  return SECURITY_PATTERNS.map(({ id, category, riskLevel, title, description, recommendation }) => ({
    id,
    category,
    riskLevel,
    title,
    description,
    recommendation,
  }))
}
