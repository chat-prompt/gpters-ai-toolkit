/**
 * Hook Simulator Tests
 *
 * Unit tests for hook event simulation, command analysis, and behavior prediction
 */

import { describe, it, expect } from 'vitest'
import {
  simulateHookEvent,
  simulateHookFromItem,
  getEventContext,
  getAllEventContexts,
  generateSampleEnvironment,
  testHookScenarios,
  generateSimulationReport,
  type HookSimulationInput,
  type SimulatedEnvironment,
} from '@/lib/plugin/hook-simulator'
import type { CatalogItem } from '@/lib/core/types'

describe('Hook Simulator', () => {
  describe('simulateHookEvent', () => {
    it('should simulate a basic echo command', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "Hello"',
        matcher: 'Bash',
      }
      const result = simulateHookEvent(input)

      expect(result.success).toBe(true)
      expect(result.event).toBe('PreToolUse')
      expect(result.matcher).toBe('Bash')
      expect(result.execution.exitCode).toBe(0)
    })

    it('should expand environment variables', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo $CLAUDE_TOOL_NAME',
        matcher: 'Read',
        environment: {
          CLAUDE_TOOL_NAME: 'Read',
          CLAUDE_PROJECT_DIR: '/test/project',
          CLAUDE_SESSION_ID: 'test-session',
        },
      }
      const result = simulateHookEvent(input)

      expect(result.expandedCommand).toBe('echo Read')
    })

    it('should expand ${VAR} format environment variables', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo ${CLAUDE_PROJECT_DIR}/file.txt',
        environment: {
          CLAUDE_PROJECT_DIR: '/test/project',
          CLAUDE_SESSION_ID: 'test-session',
        },
      }
      const result = simulateHookEvent(input)

      expect(result.expandedCommand).toBe('echo /test/project/file.txt')
    })

    it('should detect exit 1 as blocking', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'exit 1',
        blocking: true,
      }
      const result = simulateHookEvent(input)

      expect(result.behavior.wouldBlock).toBe(true)
      expect(result.behavior.wouldAllow).toBe(false)
    })

    it('should detect exit 0 as non-blocking', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test" && exit 0',
        blocking: true,
      }
      const result = simulateHookEvent(input)

      expect(result.behavior.wouldBlock).toBe(false)
      expect(result.behavior.wouldAllow).toBe(true)
    })

    it('should always allow non-blocking hooks', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'exit 1',
        blocking: false,
      }
      const result = simulateHookEvent(input)

      expect(result.behavior.wouldAllow).toBe(true)
      expect(result.behavior.reason).toContain('non-blocking')
    })

    it('should handle timeout warnings', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'curl https://example.com',
        timeout: 1000,
      }
      const result = simulateHookEvent(input)

      expect(result.execution.timedOut).toBe(true)
      expect(result.warnings.some((w) => w.includes('timeout'))).toBe(true)
    })

    it('should include timestamp in result', () => {
      const input: HookSimulationInput = {
        event: 'SessionStart',
        command: 'echo "start"',
      }
      const result = simulateHookEvent(input)

      expect(result.timestamp).toBeDefined()
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0)
    })
  })

  describe('Validation Issues', () => {
    it('should detect dangerous rm -rf / command', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'rm -rf /',
      }
      const result = simulateHookEvent(input)

      expect(result.success).toBe(false)
      expect(result.issues.some((i) => i.code === 'DANGEROUS_COMMAND')).toBe(true)
    })

    it('should detect unknown environment variables', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo $UNKNOWN_VAR',
      }
      const result = simulateHookEvent(input)

      expect(result.issues.some((i) => i.code === 'UNKNOWN_ENV_VAR')).toBe(true)
    })

    it('should warn about short timeout', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
        timeout: 50,
      }
      const result = simulateHookEvent(input)

      expect(result.issues.some((i) => i.code === 'TIMEOUT_TOO_SHORT')).toBe(true)
    })

    it('should warn about long timeout', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
        timeout: 120000,
      }
      const result = simulateHookEvent(input)

      expect(result.issues.some((i) => i.code === 'TIMEOUT_TOO_LONG')).toBe(true)
    })

    it('should warn about blocking network operations', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'curl https://api.example.com',
        blocking: true,
      }
      const result = simulateHookEvent(input)

      expect(result.issues.some((i) => i.code === 'BLOCKING_NETWORK')).toBe(true)
    })

    it('should suggest matcher for tool events', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
        // No matcher provided
      }
      const result = simulateHookEvent(input)

      expect(result.issues.some((i) => i.code === 'MISSING_MATCHER')).toBe(true)
    })

    it('should detect invalid tool matcher', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
        matcher: 'InvalidTool',
      }
      const result = simulateHookEvent(input)

      expect(result.issues.some((i) => i.code === 'INVALID_TOOL_MATCHER')).toBe(true)
    })
  })

  describe('simulateHookFromItem', () => {
    it('should simulate from a valid hook CatalogItem', () => {
      const item: Partial<CatalogItem> = {
        id: 'test-hook',
        type: 'hook',
        name: 'Test Hook',
        hookEvent: 'PreToolUse',
        hookCommand: 'echo $CLAUDE_TOOL_NAME',
        hookMatcher: 'Bash',
        hookTimeout: 5000,
        hookBlocking: true,
      }
      const result = simulateHookFromItem(item)

      expect(result.success).toBe(true)
      expect(result.event).toBe('PreToolUse')
      expect(result.matcher).toBe('Bash')
    })

    it('should fail when hookEvent is missing', () => {
      const item: Partial<CatalogItem> = {
        id: 'test-hook',
        type: 'hook',
        hookCommand: 'echo "test"',
      }
      const result = simulateHookFromItem(item)

      expect(result.success).toBe(false)
      expect(result.issues.some((i) => i.code === 'MISSING_HOOK_CONFIG')).toBe(true)
    })

    it('should fail when hookCommand is missing', () => {
      const item: Partial<CatalogItem> = {
        id: 'test-hook',
        type: 'hook',
        hookEvent: 'PreToolUse',
      }
      const result = simulateHookFromItem(item)

      expect(result.success).toBe(false)
      expect(result.issues.some((i) => i.code === 'MISSING_HOOK_CONFIG')).toBe(true)
    })

    it('should use environment overrides', () => {
      const item: Partial<CatalogItem> = {
        id: 'test-hook',
        type: 'hook',
        hookEvent: 'PreToolUse',
        hookCommand: 'echo $CLAUDE_PROJECT_DIR',
      }
      const result = simulateHookFromItem(item, {
        CLAUDE_PROJECT_DIR: '/custom/path',
      })

      expect(result.expandedCommand).toBe('echo /custom/path')
    })
  })

  describe('getEventContext', () => {
    it('should return PreToolUse context', () => {
      const context = getEventContext('PreToolUse')

      expect(context.event).toBe('PreToolUse')
      expect(context.defaultMatchers).toContain('Bash')
      expect(context.requiredEnvVars).toContain('CLAUDE_PROJECT_DIR')
      expect(context.optionalEnvVars).toContain('CLAUDE_TOOL_NAME')
    })

    it('should return PostToolUse context with TOOL_OUTPUT', () => {
      const context = getEventContext('PostToolUse')

      expect(context.optionalEnvVars).toContain('CLAUDE_TOOL_OUTPUT')
    })

    it('should return PreCompact context with CONVERSATION', () => {
      const context = getEventContext('PreCompact')

      expect(context.optionalEnvVars).toContain('CLAUDE_CONVERSATION')
    })

    it('should return SessionStart context with matchers', () => {
      const context = getEventContext('SessionStart')

      expect(context.defaultMatchers).toContain('startup')
      expect(context.defaultMatchers).toContain('resume')
    })

    it('should return SessionEnd context without matchers', () => {
      const context = getEventContext('SessionEnd')

      expect(context.defaultMatchers).toHaveLength(0)
    })
  })

  describe('getAllEventContexts', () => {
    it('should return contexts for all 10 events', () => {
      const contexts = getAllEventContexts()

      expect(Object.keys(contexts)).toHaveLength(10)
      expect(contexts).toHaveProperty('PreToolUse')
      expect(contexts).toHaveProperty('PostToolUse')
      expect(contexts).toHaveProperty('PreCompact')
      expect(contexts).toHaveProperty('SessionStart')
      expect(contexts).toHaveProperty('SessionEnd')
      expect(contexts).toHaveProperty('PermissionRequest')
      expect(contexts).toHaveProperty('Notification')
      expect(contexts).toHaveProperty('UserPromptSubmit')
      expect(contexts).toHaveProperty('Stop')
      expect(contexts).toHaveProperty('SubagentStop')
    })
  })

  describe('generateSampleEnvironment', () => {
    it('should generate sample env for PreToolUse', () => {
      const env = generateSampleEnvironment('PreToolUse')

      expect(env.CLAUDE_PROJECT_DIR).toBeDefined()
      expect(env.CLAUDE_SESSION_ID).toBeDefined()
      expect(env.CLAUDE_TOOL_NAME).toBe('Bash')
      expect(env.CLAUDE_TOOL_INPUT).toBeDefined()
    })

    it('should generate sample env for PostToolUse with output', () => {
      const env = generateSampleEnvironment('PostToolUse')

      expect(env.CLAUDE_TOOL_OUTPUT).toBeDefined()
    })

    it('should generate sample env for UserPromptSubmit', () => {
      const env = generateSampleEnvironment('UserPromptSubmit')

      expect(env.CLAUDE_USER_PROMPT).toBeDefined()
    })

    it('should generate sample env for PreCompact', () => {
      const env = generateSampleEnvironment('PreCompact')

      expect(env.CLAUDE_CONVERSATION).toBeDefined()
    })
  })

  describe('testHookScenarios', () => {
    it('should test default environment scenario', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
        matcher: 'Bash',
      }
      const { scenarios, summary } = testHookScenarios(input)

      expect(scenarios.some((s) => s.name === 'Default environment')).toBe(true)
      expect(summary.total).toBeGreaterThan(0)
    })

    it('should test empty project directory scenario', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
      }
      const { scenarios } = testHookScenarios(input)

      expect(scenarios.some((s) => s.name === 'Empty project directory')).toBe(true)
    })

    it('should test tool matchers for PreToolUse', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo $CLAUDE_TOOL_NAME',
      }
      const { scenarios } = testHookScenarios(input)

      expect(scenarios.some((s) => s.name === 'Tool: Bash')).toBe(true)
      expect(scenarios.some((s) => s.name === 'Tool: Read')).toBe(true)
      expect(scenarios.some((s) => s.name === 'Tool: Write')).toBe(true)
    })

    it('should test session triggers for SessionStart', () => {
      const input: HookSimulationInput = {
        event: 'SessionStart',
        command: 'echo "session started"',
      }
      const { scenarios } = testHookScenarios(input)

      expect(scenarios.some((s) => s.name === 'Trigger: startup')).toBe(true)
      expect(scenarios.some((s) => s.name === 'Trigger: resume')).toBe(true)
    })

    it('should calculate summary correctly', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
        matcher: 'Bash',
      }
      const { summary } = testHookScenarios(input)

      expect(summary.total).toBe(summary.passed + summary.failed)
      expect(summary.total).toBe(summary.blocked + summary.allowed)
    })
  })

  describe('generateSimulationReport', () => {
    it('should generate markdown report', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "Hello"',
        matcher: 'Bash',
      }
      const result = simulateHookEvent(input)
      const report = generateSimulationReport(result)

      expect(report).toContain('# Hook Simulation Report')
      expect(report).toContain('**Event:** PreToolUse')
      expect(report).toContain('**Matcher:** Bash')
    })

    it('should include behavior prediction', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'exit 1',
        blocking: true,
      }
      const result = simulateHookEvent(input)
      const report = generateSimulationReport(result)

      expect(report).toContain('## Behavior Prediction')
      expect(report).toContain('Would Block')
    })

    it('should include expanded command', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo $CLAUDE_TOOL_NAME',
        matcher: 'Read',
      }
      const result = simulateHookEvent(input)
      const report = generateSimulationReport(result)

      expect(report).toContain('## Expanded Command')
      expect(report).toContain('```bash')
    })

    it('should include issues when present', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'rm -rf /',
      }
      const result = simulateHookEvent(input)
      const report = generateSimulationReport(result)

      expect(report).toContain('## Issues')
      expect(report).toContain('DANGEROUS_COMMAND')
    })

    it('should include environment variables table', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "test"',
      }
      const result = simulateHookEvent(input)
      const report = generateSimulationReport(result)

      expect(report).toContain('## Environment Variables')
      expect(report).toContain('CLAUDE_PROJECT_DIR')
    })
  })

  describe('Command Analysis', () => {
    it('should detect echo command output', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "Hello World"',
      }
      const result = simulateHookEvent(input)

      expect(result.execution.stdout).toContain('Hello World')
    })

    it('should detect curl as network operation', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'curl https://api.example.com',
      }
      const result = simulateHookEvent(input)

      expect(result.execution.stdout).toContain('Network')
    })

    it('should detect conditional chains', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo "first" && echo "second"',
      }
      const result = simulateHookEvent(input)

      // The command analysis detects chain and adds a note about it
      expect(result.execution.stdout).toContain('chain')
    })

    it('should detect grep quiet mode', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'grep -q "pattern" file',
      }
      const result = simulateHookEvent(input)

      // Even in quiet mode, the simulation shows placeholder output
      expect(result.execution.stdout).toBeDefined()
    })
  })

  describe('Event-Specific Defaults', () => {
    it('should set CLAUDE_TOOL_NAME for PreToolUse', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo $CLAUDE_TOOL_NAME',
        matcher: 'Read',
      }
      const result = simulateHookEvent(input)

      expect(result.environment.CLAUDE_TOOL_NAME).toBe('Read')
    })

    it('should set CLAUDE_TOOL_OUTPUT for PostToolUse', () => {
      const input: HookSimulationInput = {
        event: 'PostToolUse',
        command: 'echo $CLAUDE_TOOL_OUTPUT',
      }
      const result = simulateHookEvent(input)

      expect(result.environment.CLAUDE_TOOL_OUTPUT).toBeDefined()
    })

    it('should set CLAUDE_USER_PROMPT for UserPromptSubmit', () => {
      const input: HookSimulationInput = {
        event: 'UserPromptSubmit',
        command: 'echo $CLAUDE_USER_PROMPT',
      }
      const result = simulateHookEvent(input)

      expect(result.environment.CLAUDE_USER_PROMPT).toBeDefined()
    })

    it('should set CLAUDE_CONVERSATION for PreCompact', () => {
      const input: HookSimulationInput = {
        event: 'PreCompact',
        command: 'echo $CLAUDE_CONVERSATION',
      }
      const result = simulateHookEvent(input)

      expect(result.environment.CLAUDE_CONVERSATION).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty command', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: '',
      }
      const result = simulateHookEvent(input)

      expect(result.expandedCommand).toBe('')
    })

    it('should handle command with only whitespace', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: '   ',
      }
      const result = simulateHookEvent(input)

      expect(result.expandedCommand).toBe('   ')
    })

    it('should handle complex pipe chains', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'cat file | grep pattern | wc -l',
      }
      const result = simulateHookEvent(input)

      expect(result.success).toBe(true)
    })

    it('should handle multiple environment variables', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'echo $CLAUDE_PROJECT_DIR $CLAUDE_TOOL_NAME',
        environment: {
          CLAUDE_PROJECT_DIR: '/test',
          CLAUDE_SESSION_ID: 'test-session',
          CLAUDE_TOOL_NAME: 'Bash',
        },
      }
      const result = simulateHookEvent(input)

      expect(result.expandedCommand).toBe('echo /test Bash')
    })

    it('should handle blocking hooks with exit codes', () => {
      const input: HookSimulationInput = {
        event: 'PreToolUse',
        command: 'exit 1',
        blocking: true,
      }
      const result = simulateHookEvent(input)

      // Exit 1 in a blocking hook should block the action
      expect(result.behavior.wouldBlock).toBe(true)
      expect(result.behavior.reason).toContain('blocks')
    })
  })
})
