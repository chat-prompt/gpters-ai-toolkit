/**
 * Hook Event Simulator
 *
 * Simulates Claude Code hook events for testing:
 * - Event-specific test triggers
 * - Dry-run command execution
 * - Output result preview
 * - Error scenario testing
 */

import type { HookEvent, HookMatcher, CatalogItem } from '../core/types'
import { HOOK_EVENTS } from '../core/types'
import { createLogger } from '../core/logger'

const log = createLogger('hook-simulator')

/**
 * Simulated environment variables available in hooks
 */
export interface SimulatedEnvironment {
  /** Current project directory */
  CLAUDE_PROJECT_DIR: string
  /** Current session ID */
  CLAUDE_SESSION_ID: string
  /** Current conversation transcript (for PreCompact) */
  CLAUDE_CONVERSATION?: string
  /** Tool input (for PreToolUse/PostToolUse) */
  CLAUDE_TOOL_INPUT?: string
  /** Tool output (for PostToolUse) */
  CLAUDE_TOOL_OUTPUT?: string
  /** Tool name being used */
  CLAUDE_TOOL_NAME?: string
  /** User prompt (for UserPromptSubmit) */
  CLAUDE_USER_PROMPT?: string
  /** Custom environment variables */
  [key: string]: string | undefined
}

/**
 * Hook simulation input
 */
export interface HookSimulationInput {
  /** Hook event type to simulate */
  event: HookEvent
  /** Event matcher (tool name, trigger type, etc.) */
  matcher?: HookMatcher
  /** Shell command to execute */
  command: string
  /** Timeout in milliseconds */
  timeout?: number
  /** Whether hook is blocking */
  blocking?: boolean
  /** Simulated environment variables */
  environment?: Partial<SimulatedEnvironment>
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Execution duration in ms */
  duration: number
  /** Whether execution was truncated due to timeout */
  timedOut: boolean
  /** Whether command was killed */
  killed: boolean
}

/**
 * Hook simulation result
 */
export interface HookSimulationResult {
  /** Whether simulation was successful */
  success: boolean
  /** Event that was simulated */
  event: HookEvent
  /** Matcher used */
  matcher?: HookMatcher
  /** Simulated environment */
  environment: SimulatedEnvironment
  /** Command that was executed (with env vars substituted) */
  expandedCommand: string
  /** Execution result (for dry-run mode, shows expected output) */
  execution: CommandExecutionResult
  /** Hook behavior prediction */
  behavior: {
    /** Would this hook block the action? */
    wouldBlock: boolean
    /** Would this hook allow the action? */
    wouldAllow: boolean
    /** Reason for the prediction */
    reason: string
  }
  /** Validation issues found */
  issues: SimulationIssue[]
  /** Warnings */
  warnings: string[]
  /** Timestamp */
  timestamp: string
}

/**
 * Simulation issue
 */
export interface SimulationIssue {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  suggestion?: string
}

/**
 * Event context for different hook types
 */
export interface EventContext {
  /** Event type */
  event: HookEvent
  /** Default matcher values */
  defaultMatchers: string[]
  /** Required environment variables */
  requiredEnvVars: string[]
  /** Optional environment variables */
  optionalEnvVars: string[]
  /** Description */
  description: string
}

/**
 * Event context definitions
 */
const EVENT_CONTEXTS: Record<HookEvent, EventContext> = {
  PreToolUse: {
    event: 'PreToolUse',
    defaultMatchers: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task'],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: ['CLAUDE_TOOL_INPUT', 'CLAUDE_TOOL_NAME'],
    description: '도구 실행 전 호출됩니다. exit 1로 실행을 차단할 수 있습니다.',
  },
  PostToolUse: {
    event: 'PostToolUse',
    defaultMatchers: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task'],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: ['CLAUDE_TOOL_INPUT', 'CLAUDE_TOOL_OUTPUT', 'CLAUDE_TOOL_NAME'],
    description: '도구 실행 완료 후 호출됩니다.',
  },
  PreCompact: {
    event: 'PreCompact',
    defaultMatchers: ['auto', 'manual'],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID'],
    optionalEnvVars: ['CLAUDE_CONVERSATION'],
    description: 'Compaction 직전에 호출됩니다. 대화 내용 백업에 유용합니다.',
  },
  SessionStart: {
    event: 'SessionStart',
    defaultMatchers: ['startup', 'resume', 'compact', 'clear'],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID'],
    optionalEnvVars: [],
    description: '세션 시작/재개 시 호출됩니다.',
  },
  SessionEnd: {
    event: 'SessionEnd',
    defaultMatchers: [],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID'],
    optionalEnvVars: [],
    description: '세션 종료 시 호출됩니다.',
  },
  PermissionRequest: {
    event: 'PermissionRequest',
    defaultMatchers: ['Bash', 'Read', 'Write', 'Edit'],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: ['CLAUDE_TOOL_NAME'],
    description: '권한 요청 시 호출됩니다.',
  },
  Notification: {
    event: 'Notification',
    defaultMatchers: [],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: [],
    description: '알림 발생 시 호출됩니다.',
  },
  UserPromptSubmit: {
    event: 'UserPromptSubmit',
    defaultMatchers: [],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: ['CLAUDE_USER_PROMPT'],
    description: '사용자 프롬프트 제출 시 호출됩니다.',
  },
  Stop: {
    event: 'Stop',
    defaultMatchers: [],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: [],
    description: '작업 중지 시 호출됩니다.',
  },
  SubagentStop: {
    event: 'SubagentStop',
    defaultMatchers: [],
    requiredEnvVars: ['CLAUDE_PROJECT_DIR'],
    optionalEnvVars: [],
    description: '서브에이전트 중지 시 호출됩니다.',
  },
}

/**
 * Default simulation environment
 */
function getDefaultEnvironment(): SimulatedEnvironment {
  return {
    CLAUDE_PROJECT_DIR: '/path/to/project',
    CLAUDE_SESSION_ID: `session-${Date.now()}`,
  }
}

/**
 * Expand environment variables in a command
 */
function expandEnvironmentVariables(command: string, env: SimulatedEnvironment): string {
  let expanded = command

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      // Replace $VAR and ${VAR} patterns
      expanded = expanded.replace(new RegExp(`\\$${key}\\b`, 'g'), value)
      expanded = expanded.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value)
    }
  }

  return expanded
}

/**
 * Simulate command execution (dry-run)
 */
function simulateCommandExecution(
  command: string,
  timeout: number = 5000
): CommandExecutionResult {
  const startTime = Date.now()

  // Analyze command to predict output
  const analysis = analyzeCommand(command)

  return {
    exitCode: analysis.expectedExitCode,
    stdout: analysis.expectedOutput,
    stderr: analysis.expectedStderr,
    duration: Math.min(analysis.estimatedDuration, timeout),
    timedOut: analysis.estimatedDuration > timeout,
    killed: false,
  }
}

/**
 * Analyze a command to predict its behavior
 */
function analyzeCommand(command: string): {
  expectedExitCode: number
  expectedOutput: string
  expectedStderr: string
  estimatedDuration: number
} {
  // Parse command to understand what it does
  const isEcho = command.includes('echo ')
  const isExitOne = /exit\s+1/.test(command)
  const isExitZero = /exit\s+0/.test(command)
  const isCurl = command.includes('curl ')
  const isCat = command.includes('cat ')
  const isMkdir = command.includes('mkdir ')
  const isTest = command.startsWith('test ') || command.includes(' test ')
  const isGrep = command.includes('grep ')
  const hasPipe = command.includes(' | ')
  const hasAnd = command.includes(' && ')
  const hasOr = command.includes(' || ')

  let expectedOutput = ''
  const expectedStderr = ''
  let expectedExitCode = 0
  let estimatedDuration = 100

  // Simulate echo output
  if (isEcho) {
    const echoMatch = command.match(/echo\s+"([^"]*)"/) || command.match(/echo\s+'([^']*)'/) || command.match(/echo\s+([^\s|&;]+)/)
    if (echoMatch) {
      expectedOutput = echoMatch[1] || 'output'
    }
  }

  // Handle explicit exit codes
  if (isExitOne) {
    expectedExitCode = 1
  } else if (isExitZero) {
    expectedExitCode = 0
  }

  // Handle conditional chains
  if (hasAnd && !hasOr) {
    // All commands must succeed
    expectedOutput += '\n[Simulated: All commands in chain would execute]'
  }
  if (hasOr) {
    // Fallback chain
    expectedOutput += '\n[Simulated: Fallback chain - first successful command wins]'
  }

  // Network operations take longer
  if (isCurl) {
    estimatedDuration = 2000
    expectedOutput = '[Simulated: Network request]'
  }

  // File operations
  if (isCat) {
    expectedOutput = '[Simulated: File content would be displayed]'
  }
  if (isMkdir) {
    expectedOutput = '[Simulated: Directory created]'
  }

  // Test/grep operations
  if (isTest) {
    expectedOutput = '[Simulated: Test condition evaluated]'
  }
  if (isGrep) {
    expectedOutput = '[Simulated: Pattern matching performed]'
    if (command.includes('grep -q')) {
      expectedOutput = '' // -q is quiet mode
    }
  }

  // Handle date substitution in echo
  if (command.includes('$(date')) {
    expectedOutput = expectedOutput.replace(/\$\(date[^)]*\)/g, new Date().toISOString())
  }

  return {
    expectedExitCode,
    expectedOutput: expectedOutput.trim() || '[No output expected]',
    expectedStderr,
    estimatedDuration,
  }
}

/**
 * Predict hook behavior based on command analysis
 */
function predictBehavior(
  command: string,
  execution: CommandExecutionResult,
  blocking: boolean
): { wouldBlock: boolean; wouldAllow: boolean; reason: string } {
  const hasExitOne = /exit\s+1/.test(command)
  const hasExitZero = /exit\s+0/.test(command)
  const hasConditionalBlock = /&&\s+exit\s+1/.test(command) || /\|\|\s+exit\s+1/.test(command)

  if (!blocking) {
    return {
      wouldBlock: false,
      wouldAllow: true,
      reason: 'Hook is non-blocking, action will always proceed',
    }
  }

  if (execution.exitCode === 1 || hasExitOne) {
    return {
      wouldBlock: true,
      wouldAllow: false,
      reason: 'Command exits with code 1, which blocks the action',
    }
  }

  if (hasConditionalBlock) {
    return {
      wouldBlock: false,
      wouldAllow: true,
      reason: 'Conditional blocking: will block only if pattern matches',
    }
  }

  if (hasExitZero || execution.exitCode === 0) {
    return {
      wouldBlock: false,
      wouldAllow: true,
      reason: 'Command exits with code 0, action will proceed',
    }
  }

  return {
    wouldBlock: false,
    wouldAllow: true,
    reason: 'Default behavior: action will proceed',
  }
}

/**
 * Validate hook configuration
 */
function validateHookConfig(input: HookSimulationInput): SimulationIssue[] {
  const issues: SimulationIssue[] = []
  const eventContext = EVENT_CONTEXTS[input.event]

  // Check if matcher is valid for this event type
  if (input.matcher && eventContext.defaultMatchers.length > 0) {
    // Tool events use tool names as matchers
    if (['PreToolUse', 'PostToolUse', 'PermissionRequest'].includes(input.event)) {
      const validToolMatchers = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch', 'TodoWrite', 'NotebookEdit']
      if (!validToolMatchers.includes(input.matcher)) {
        issues.push({
          code: 'INVALID_TOOL_MATCHER',
          message: `Matcher '${input.matcher}' is not a valid tool name`,
          severity: 'warning',
          suggestion: `Valid tool matchers: ${validToolMatchers.join(', ')}`,
        })
      }
    }
  }

  // Check if event requires matcher but none provided
  if (eventContext.defaultMatchers.length > 0 && !input.matcher) {
    issues.push({
      code: 'MISSING_MATCHER',
      message: `Event '${input.event}' typically uses a matcher`,
      severity: 'info',
      suggestion: `Suggested matchers: ${eventContext.defaultMatchers.join(', ')}`,
    })
  }

  // Check for potentially dangerous commands
  if (/rm\s+-rf\s+\//.test(input.command)) {
    issues.push({
      code: 'DANGEROUS_COMMAND',
      message: 'Command contains potentially dangerous rm -rf /',
      severity: 'error',
      suggestion: 'Remove or modify this command to avoid system damage',
    })
  }

  // Check for missing environment variable references
  const envVarPattern = /\$([A-Z_][A-Z0-9_]*)/g
  const referencedVars = [...input.command.matchAll(envVarPattern)].map((m) => m[1])
  const allEnvVars = [...eventContext.requiredEnvVars, ...eventContext.optionalEnvVars]

  for (const varName of referencedVars) {
    if (!allEnvVars.includes(varName) && !['HOME', 'USER', 'PATH'].includes(varName)) {
      issues.push({
        code: 'UNKNOWN_ENV_VAR',
        message: `Unknown environment variable: $${varName}`,
        severity: 'warning',
        suggestion: `Available Claude variables: ${allEnvVars.join(', ')}`,
      })
    }
  }

  // Check timeout value
  if (input.timeout !== undefined) {
    if (input.timeout < 100) {
      issues.push({
        code: 'TIMEOUT_TOO_SHORT',
        message: 'Timeout is very short (< 100ms)',
        severity: 'warning',
        suggestion: 'Consider using at least 1000ms for reliable execution',
      })
    }
    if (input.timeout > 60000) {
      issues.push({
        code: 'TIMEOUT_TOO_LONG',
        message: 'Timeout is very long (> 60s)',
        severity: 'info',
        suggestion: 'Long timeouts may cause Claude Code to appear frozen',
      })
    }
  }

  // Check for blocking hooks with network operations
  if (input.blocking && /curl|wget|fetch/.test(input.command)) {
    issues.push({
      code: 'BLOCKING_NETWORK',
      message: 'Blocking hook with network operation may cause delays',
      severity: 'warning',
      suggestion: 'Consider making this hook non-blocking',
    })
  }

  return issues
}

/**
 * Simulate a hook event
 */
export function simulateHookEvent(input: HookSimulationInput): HookSimulationResult {
  log.info('Simulating hook event', { event: input.event, matcher: input.matcher })

  // Build environment
  const defaultEnv = getDefaultEnvironment()
  const eventContext = EVENT_CONTEXTS[input.event]
  const environment: SimulatedEnvironment = {
    ...defaultEnv,
    ...input.environment,
  }

  // Add event-specific defaults
  if (['PreToolUse', 'PostToolUse'].includes(input.event)) {
    environment.CLAUDE_TOOL_NAME = input.matcher || 'Bash'
    environment.CLAUDE_TOOL_INPUT = environment.CLAUDE_TOOL_INPUT || 'echo "test command"'
  }
  if (input.event === 'PostToolUse') {
    environment.CLAUDE_TOOL_OUTPUT = environment.CLAUDE_TOOL_OUTPUT || 'Command output'
  }
  if (input.event === 'UserPromptSubmit') {
    environment.CLAUDE_USER_PROMPT = environment.CLAUDE_USER_PROMPT || 'User prompt text'
  }
  if (input.event === 'PreCompact') {
    environment.CLAUDE_CONVERSATION = environment.CLAUDE_CONVERSATION || '[Conversation transcript...]'
  }

  // Expand environment variables in command
  const expandedCommand = expandEnvironmentVariables(input.command, environment)

  // Validate hook configuration
  const issues = validateHookConfig(input)

  // Simulate command execution
  const timeout = input.timeout || 5000
  const execution = simulateCommandExecution(expandedCommand, timeout)

  // Predict behavior
  const blocking = input.blocking ?? true
  const behavior = predictBehavior(input.command, execution, blocking)

  // Generate warnings
  const warnings: string[] = []
  if (execution.timedOut) {
    warnings.push(`Command would timeout after ${timeout}ms`)
  }
  if (!blocking && behavior.wouldBlock) {
    warnings.push('Non-blocking hook cannot block actions')
  }

  const result: HookSimulationResult = {
    success: issues.filter((i) => i.severity === 'error').length === 0,
    event: input.event,
    matcher: input.matcher,
    environment,
    expandedCommand,
    execution,
    behavior,
    issues,
    warnings,
    timestamp: new Date().toISOString(),
  }

  log.info('Simulation complete', {
    event: input.event,
    success: result.success,
    wouldBlock: behavior.wouldBlock,
    issues: issues.length,
  })

  return result
}

/**
 * Simulate a hook from a CatalogItem (hook type)
 */
export function simulateHookFromItem(
  item: Partial<CatalogItem>,
  environmentOverrides?: Partial<SimulatedEnvironment>
): HookSimulationResult {
  if (!item.hookEvent || !item.hookCommand) {
    return {
      success: false,
      event: 'PreToolUse',
      environment: getDefaultEnvironment(),
      expandedCommand: '',
      execution: {
        exitCode: 1,
        stdout: '',
        stderr: 'Missing hookEvent or hookCommand',
        duration: 0,
        timedOut: false,
        killed: false,
      },
      behavior: {
        wouldBlock: false,
        wouldAllow: false,
        reason: 'Invalid hook configuration',
      },
      issues: [
        {
          code: 'MISSING_HOOK_CONFIG',
          message: 'Hook must have hookEvent and hookCommand',
          severity: 'error',
        },
      ],
      warnings: [],
      timestamp: new Date().toISOString(),
    }
  }

  return simulateHookEvent({
    event: item.hookEvent,
    matcher: item.hookMatcher,
    command: item.hookCommand,
    timeout: item.hookTimeout,
    blocking: item.hookBlocking,
    environment: environmentOverrides,
  })
}

/**
 * Get event context information
 */
export function getEventContext(event: HookEvent): EventContext {
  return EVENT_CONTEXTS[event]
}

/**
 * Get all event contexts
 */
export function getAllEventContexts(): Record<HookEvent, EventContext> {
  return EVENT_CONTEXTS
}

/**
 * Generate sample environment for an event type
 */
export function generateSampleEnvironment(event: HookEvent): SimulatedEnvironment {
  const base = getDefaultEnvironment()
  const context = EVENT_CONTEXTS[event]

  const env: SimulatedEnvironment = { ...base }

  // Add sample values for required vars
  for (const varName of context.requiredEnvVars) {
    if (!env[varName]) {
      switch (varName) {
        case 'CLAUDE_PROJECT_DIR':
          env.CLAUDE_PROJECT_DIR = '/Users/user/projects/my-project'
          break
        case 'CLAUDE_SESSION_ID':
          env.CLAUDE_SESSION_ID = 'session-abc123'
          break
        default:
          env[varName] = `[${varName}]`
      }
    }
  }

  // Add sample values for optional vars
  for (const varName of context.optionalEnvVars) {
    switch (varName) {
      case 'CLAUDE_TOOL_INPUT':
        env.CLAUDE_TOOL_INPUT = 'ls -la'
        break
      case 'CLAUDE_TOOL_OUTPUT':
        env.CLAUDE_TOOL_OUTPUT = 'drwxr-xr-x 10 user user 320 Jan 1 12:00 .'
        break
      case 'CLAUDE_TOOL_NAME':
        env.CLAUDE_TOOL_NAME = 'Bash'
        break
      case 'CLAUDE_USER_PROMPT':
        env.CLAUDE_USER_PROMPT = 'Help me with this code'
        break
      case 'CLAUDE_CONVERSATION':
        env.CLAUDE_CONVERSATION = '[Conversation with 50 messages...]'
        break
      default:
        env[varName] = `[sample-${varName}]`
    }
  }

  return env
}

/**
 * Test multiple scenarios for a hook
 */
export function testHookScenarios(input: HookSimulationInput): {
  scenarios: Array<{
    name: string
    result: HookSimulationResult
  }>
  summary: {
    total: number
    passed: number
    failed: number
    blocked: number
    allowed: number
  }
} {
  const scenarios: Array<{ name: string; result: HookSimulationResult }> = []
  const eventContext = EVENT_CONTEXTS[input.event]

  // Test with default environment
  scenarios.push({
    name: 'Default environment',
    result: simulateHookEvent(input),
  })

  // Test with empty project dir
  scenarios.push({
    name: 'Empty project directory',
    result: simulateHookEvent({
      ...input,
      environment: {
        ...input.environment,
        CLAUDE_PROJECT_DIR: '',
      },
    }),
  })

  // Test with various matchers (for tool events)
  if (['PreToolUse', 'PostToolUse'].includes(input.event)) {
    for (const matcher of ['Bash', 'Read', 'Write']) {
      scenarios.push({
        name: `Tool: ${matcher}`,
        result: simulateHookEvent({
          ...input,
          matcher,
          environment: {
            ...input.environment,
            CLAUDE_TOOL_NAME: matcher,
          },
        }),
      })
    }
  }

  // Test with various session triggers (for session events)
  if (input.event === 'SessionStart') {
    for (const matcher of ['startup', 'resume', 'compact']) {
      scenarios.push({
        name: `Trigger: ${matcher}`,
        result: simulateHookEvent({
          ...input,
          matcher,
        }),
      })
    }
  }

  // Calculate summary
  const passed = scenarios.filter((s) => s.result.success).length
  const blocked = scenarios.filter((s) => s.result.behavior.wouldBlock).length

  return {
    scenarios,
    summary: {
      total: scenarios.length,
      passed,
      failed: scenarios.length - passed,
      blocked,
      allowed: scenarios.length - blocked,
    },
  }
}

/**
 * Generate a simulation report
 */
export function generateSimulationReport(result: HookSimulationResult): string {
  const lines: string[] = []

  lines.push('# Hook Simulation Report')
  lines.push('')
  lines.push(`**Event:** ${result.event}`)
  if (result.matcher) {
    lines.push(`**Matcher:** ${result.matcher}`)
  }
  lines.push(`**Status:** ${result.success ? '✅ Valid' : '❌ Issues Found'}`)
  lines.push(`**Time:** ${result.timestamp}`)
  lines.push('')

  lines.push('## Behavior Prediction')
  lines.push('')
  lines.push(`- **Would Block:** ${result.behavior.wouldBlock ? '🚫 Yes' : '✅ No'}`)
  lines.push(`- **Would Allow:** ${result.behavior.wouldAllow ? '✅ Yes' : '❌ No'}`)
  lines.push(`- **Reason:** ${result.behavior.reason}`)
  lines.push('')

  lines.push('## Expanded Command')
  lines.push('')
  lines.push('```bash')
  lines.push(result.expandedCommand)
  lines.push('```')
  lines.push('')

  lines.push('## Simulated Execution')
  lines.push('')
  lines.push(`- **Exit Code:** ${result.execution.exitCode}`)
  lines.push(`- **Duration:** ${result.execution.duration}ms`)
  if (result.execution.timedOut) {
    lines.push(`- **Timed Out:** ⚠️ Yes`)
  }
  lines.push('')

  if (result.execution.stdout) {
    lines.push('### stdout')
    lines.push('```')
    lines.push(result.execution.stdout)
    lines.push('```')
    lines.push('')
  }

  if (result.execution.stderr) {
    lines.push('### stderr')
    lines.push('```')
    lines.push(result.execution.stderr)
    lines.push('```')
    lines.push('')
  }

  if (result.issues.length > 0) {
    lines.push('## Issues')
    lines.push('')
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️'
      lines.push(`- ${icon} **${issue.code}**: ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`  - 💡 ${issue.suggestion}`)
      }
    }
    lines.push('')
  }

  if (result.warnings.length > 0) {
    lines.push('## Warnings')
    lines.push('')
    for (const warning of result.warnings) {
      lines.push(`- ⚠️ ${warning}`)
    }
    lines.push('')
  }

  lines.push('## Environment Variables')
  lines.push('')
  lines.push('| Variable | Value |')
  lines.push('|----------|-------|')
  for (const [key, value] of Object.entries(result.environment)) {
    if (value) {
      const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value
      lines.push(`| \`${key}\` | \`${displayValue}\` |`)
    }
  }

  return lines.join('\n')
}
