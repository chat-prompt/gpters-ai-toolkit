/**
 * Command Testing Framework
 *
 * Provides utilities for testing command behavior including
 * input/output validation, argument parsing, error handling,
 * and mock execution mode.
 */

import { createLogger } from '../logger'

const log = createLogger('command-testing')

/**
 * Command argument definition
 */
export interface CommandArgument {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  default?: unknown
  description?: string
  validate?: (value: unknown) => boolean | string
  aliases?: string[]
}

/**
 * Command definition for testing
 */
export interface CommandDefinition {
  name: string
  description: string
  arguments: CommandArgument[]
  handler: (args: Record<string, unknown>) => Promise<CommandResult>
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean
  output?: unknown
  error?: string
  exitCode: number
  stdout?: string
  stderr?: string
  duration?: number
  metadata?: Record<string, unknown>
}

/**
 * Parsed arguments
 */
export interface ParsedArgs {
  valid: boolean
  args: Record<string, unknown>
  errors: string[]
  unknownArgs: string[]
}

/**
 * Test case definition
 */
export interface TestCase {
  name: string
  description?: string
  input: Record<string, unknown>
  expected: Partial<CommandResult>
  timeout?: number
  skip?: boolean
  only?: boolean
}

/**
 * Test result
 */
export interface TestResult {
  name: string
  passed: boolean
  duration: number
  input: Record<string, unknown>
  expected: Partial<CommandResult>
  actual?: CommandResult
  error?: string
  assertions: AssertionResult[]
}

/**
 * Assertion result
 */
export interface AssertionResult {
  assertion: string
  passed: boolean
  expected?: unknown
  actual?: unknown
  message?: string
}

/**
 * Test suite result
 */
export interface TestSuiteResult {
  command: string
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  results: TestResult[]
}

/**
 * Mock handler for testing
 */
export interface MockHandler {
  returnValue?: CommandResult
  throwError?: Error
  delay?: number
  callCount: number
  calls: Array<{ args: Record<string, unknown>; timestamp: number }>
}

/**
 * Parse command arguments
 */
export function parseArguments(
  definition: CommandDefinition,
  rawArgs: Record<string, unknown>
): ParsedArgs {
  const errors: string[] = []
  const unknownArgs: string[] = []
  const args: Record<string, unknown> = {}

  // Get all known argument names and aliases
  const knownArgs = new Set<string>()
  const aliasMap = new Map<string, string>()

  for (const argDef of definition.arguments) {
    knownArgs.add(argDef.name)
    if (argDef.aliases) {
      for (const alias of argDef.aliases) {
        knownArgs.add(alias)
        aliasMap.set(alias, argDef.name)
      }
    }
  }

  // Identify unknown arguments
  for (const key of Object.keys(rawArgs)) {
    if (!knownArgs.has(key)) {
      unknownArgs.push(key)
    }
  }

  // Process each argument definition
  for (const argDef of definition.arguments) {
    // Check for value using name or aliases
    let value: unknown = rawArgs[argDef.name]
    if (value === undefined && argDef.aliases) {
      for (const alias of argDef.aliases) {
        if (rawArgs[alias] !== undefined) {
          value = rawArgs[alias]
          break
        }
      }
    }

    // Apply default if no value
    if (value === undefined) {
      if (argDef.required) {
        errors.push(`Missing required argument: ${argDef.name}`)
        continue
      }
      value = argDef.default
    }

    // Type coercion and validation
    if (value !== undefined) {
      const coerced = coerceType(value, argDef.type)

      if (coerced.error) {
        errors.push(`Argument "${argDef.name}": ${coerced.error}`)
        continue
      }

      // Custom validation
      if (argDef.validate) {
        const validResult = argDef.validate(coerced.value)
        if (typeof validResult === 'string') {
          errors.push(`Argument "${argDef.name}": ${validResult}`)
          continue
        } else if (!validResult) {
          errors.push(`Argument "${argDef.name}" failed validation`)
          continue
        }
      }

      args[argDef.name] = coerced.value
    }
  }

  return {
    valid: errors.length === 0,
    args,
    errors,
    unknownArgs,
  }
}

/**
 * Coerce value to expected type
 */
function coerceType(
  value: unknown,
  type: CommandArgument['type']
): { value?: unknown; error?: string } {
  switch (type) {
    case 'string':
      return { value: String(value) }

    case 'number': {
      const num = Number(value)
      if (isNaN(num)) {
        return { error: `Cannot convert "${value}" to number` }
      }
      return { value: num }
    }

    case 'boolean':
      if (typeof value === 'boolean') return { value }
      if (value === 'true' || value === '1') return { value: true }
      if (value === 'false' || value === '0') return { value: false }
      return { value: Boolean(value) }

    case 'array':
      if (Array.isArray(value)) return { value }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return { value: parsed }
        } catch {
          // Try comma-separated
          return { value: value.split(',').map((s) => s.trim()) }
        }
      }
      return { value: [value] }

    case 'object':
      if (typeof value === 'object' && value !== null) return { value }
      if (typeof value === 'string') {
        try {
          return { value: JSON.parse(value) }
        } catch {
          return { error: `Cannot parse "${value}" as object` }
        }
      }
      return { error: `Cannot convert to object` }

    default:
      return { value }
  }
}

/**
 * Validate command output
 */
export function validateOutput(
  actual: CommandResult,
  expected: Partial<CommandResult>
): AssertionResult[] {
  const assertions: AssertionResult[] = []

  // Check success status
  if (expected.success !== undefined) {
    assertions.push({
      assertion: 'success status',
      passed: actual.success === expected.success,
      expected: expected.success,
      actual: actual.success,
    })
  }

  // Check exit code
  if (expected.exitCode !== undefined) {
    assertions.push({
      assertion: 'exit code',
      passed: actual.exitCode === expected.exitCode,
      expected: expected.exitCode,
      actual: actual.exitCode,
    })
  }

  // Check output
  if (expected.output !== undefined) {
    const outputMatches = deepEqual(actual.output, expected.output)
    assertions.push({
      assertion: 'output',
      passed: outputMatches,
      expected: expected.output,
      actual: actual.output,
    })
  }

  // Check error message
  if (expected.error !== undefined) {
    const errorMatches = expected.error === actual.error ||
      (actual.error?.includes(expected.error) ?? false)
    assertions.push({
      assertion: 'error message',
      passed: errorMatches,
      expected: expected.error,
      actual: actual.error,
    })
  }

  // Check stdout
  if (expected.stdout !== undefined) {
    const stdoutMatches = expected.stdout === actual.stdout ||
      actual.stdout?.includes(expected.stdout)
    assertions.push({
      assertion: 'stdout',
      passed: stdoutMatches || false,
      expected: expected.stdout,
      actual: actual.stdout,
    })
  }

  // Check stderr
  if (expected.stderr !== undefined) {
    const stderrMatches = expected.stderr === actual.stderr ||
      actual.stderr?.includes(expected.stderr)
    assertions.push({
      assertion: 'stderr',
      passed: stderrMatches || false,
      expected: expected.stderr,
      actual: actual.stderr,
    })
  }

  return assertions
}

/**
 * Deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (typeof a !== 'object') return a === b

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, idx) => deepEqual(val, b[idx]))
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false

  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>
  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)

  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual(objA[key], objB[key]))
}

/**
 * Create a mock handler for testing
 */
export function createMockHandler(options?: {
  returnValue?: CommandResult
  throwError?: Error
  delay?: number
}): MockHandler {
  return {
    returnValue: options?.returnValue,
    throwError: options?.throwError,
    delay: options?.delay,
    callCount: 0,
    calls: [],
  }
}

/**
 * Execute command with mock handler
 */
export async function executeWithMock(
  definition: CommandDefinition,
  args: Record<string, unknown>,
  mock: MockHandler
): Promise<CommandResult> {
  // Record call
  mock.callCount++
  mock.calls.push({
    args: { ...args },
    timestamp: Date.now(),
  })

  // Apply delay if specified
  if (mock.delay && mock.delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, mock.delay))
  }

  // Throw error if specified
  if (mock.throwError) {
    throw mock.throwError
  }

  // Return mock value or default success
  return mock.returnValue || {
    success: true,
    exitCode: 0,
    output: null,
  }
}

/**
 * Run a single test case
 */
export async function runTestCase(
  definition: CommandDefinition,
  testCase: TestCase,
  mock?: MockHandler
): Promise<TestResult> {
  const startTime = Date.now()

  // Parse arguments
  const parsed = parseArguments(definition, testCase.input)

  if (!parsed.valid) {
    // If parsing fails and we expected an error, that might be valid
    if (testCase.expected.success === false) {
      return {
        name: testCase.name,
        passed: true,
        duration: Date.now() - startTime,
        input: testCase.input,
        expected: testCase.expected,
        actual: {
          success: false,
          exitCode: 1,
          error: parsed.errors.join('; '),
        },
        assertions: [{
          assertion: 'argument parsing',
          passed: true,
          message: 'Expected failure, got parsing error',
        }],
      }
    }

    return {
      name: testCase.name,
      passed: false,
      duration: Date.now() - startTime,
      input: testCase.input,
      expected: testCase.expected,
      error: `Argument parsing failed: ${parsed.errors.join('; ')}`,
      assertions: [{
        assertion: 'argument parsing',
        passed: false,
        message: parsed.errors.join('; '),
      }],
    }
  }

  try {
    // Execute command (with mock or real handler)
    let result: CommandResult

    if (mock) {
      result = await executeWithMock(definition, parsed.args, mock)
    } else {
      // Apply timeout
      const timeout = testCase.timeout || 30000
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), timeout)
      })

      result = await Promise.race([
        definition.handler(parsed.args),
        timeoutPromise,
      ])
    }

    result.duration = Date.now() - startTime

    // Validate output
    const assertions = validateOutput(result, testCase.expected)
    const passed = assertions.every((a) => a.passed)

    return {
      name: testCase.name,
      passed,
      duration: Date.now() - startTime,
      input: testCase.input,
      expected: testCase.expected,
      actual: result,
      assertions,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check if error was expected
    if (testCase.expected.success === false) {
      const assertions: AssertionResult[] = [
        {
          assertion: 'throws error',
          passed: true,
          message: `Expected error, got: ${errorMessage}`,
        },
      ]

      if (testCase.expected.error) {
        const errorMatches = errorMessage.includes(testCase.expected.error)
        assertions.push({
          assertion: 'error message',
          passed: errorMatches,
          expected: testCase.expected.error,
          actual: errorMessage,
        })
      }

      return {
        name: testCase.name,
        passed: assertions.every((a) => a.passed),
        duration: Date.now() - startTime,
        input: testCase.input,
        expected: testCase.expected,
        actual: {
          success: false,
          exitCode: 1,
          error: errorMessage,
        },
        assertions,
      }
    }

    return {
      name: testCase.name,
      passed: false,
      duration: Date.now() - startTime,
      input: testCase.input,
      expected: testCase.expected,
      error: errorMessage,
      assertions: [{
        assertion: 'no error',
        passed: false,
        message: `Unexpected error: ${errorMessage}`,
      }],
    }
  }
}

/**
 * Run a test suite
 */
export async function runTestSuite(
  definition: CommandDefinition,
  testCases: TestCase[],
  options?: {
    mock?: MockHandler
    stopOnFailure?: boolean
    parallel?: boolean
  }
): Promise<TestSuiteResult> {
  const startTime = Date.now()
  const results: TestResult[] = []
  let skipped = 0

  // Check for 'only' tests
  const hasOnly = testCases.some((tc) => tc.only)
  const casesToRun = hasOnly
    ? testCases.filter((tc) => tc.only)
    : testCases

  if (options?.parallel) {
    // Run tests in parallel
    const promises = casesToRun.map((tc) => {
      if (tc.skip) {
        skipped++
        return Promise.resolve({
          name: tc.name,
          passed: true,
          duration: 0,
          input: tc.input,
          expected: tc.expected,
          assertions: [],
        } as TestResult)
      }
      return runTestCase(definition, tc, options?.mock)
    })

    const parallelResults = await Promise.all(promises)
    results.push(...parallelResults)
  } else {
    // Run tests sequentially
    for (const tc of casesToRun) {
      if (tc.skip) {
        skipped++
        results.push({
          name: tc.name,
          passed: true,
          duration: 0,
          input: tc.input,
          expected: tc.expected,
          assertions: [],
        })
        continue
      }

      const result = await runTestCase(definition, tc, options?.mock)
      results.push(result)

      if (!result.passed && options?.stopOnFailure) {
        break
      }
    }
  }

  // Count for skipped tests not in casesToRun
  const notRunCount = testCases.length - casesToRun.length

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  log.info(`Test suite completed for ${definition.name}`, {
    total: results.length,
    passed,
    failed,
    skipped: skipped + notRunCount,
  })

  return {
    command: definition.name,
    total: testCases.length,
    passed,
    failed,
    skipped: skipped + notRunCount,
    duration: Date.now() - startTime,
    results,
  }
}

/**
 * Create test case builder
 */
export class TestCaseBuilder {
  private testCase: Partial<TestCase> = {}

  static create(name: string): TestCaseBuilder {
    const builder = new TestCaseBuilder()
    builder.testCase.name = name
    return builder
  }

  description(desc: string): this {
    this.testCase.description = desc
    return this
  }

  input(args: Record<string, unknown>): this {
    this.testCase.input = args
    return this
  }

  expectSuccess(output?: unknown): this {
    this.testCase.expected = {
      success: true,
      exitCode: 0,
      ...(output !== undefined ? { output } : {}),
    }
    return this
  }

  expectFailure(error?: string): this {
    this.testCase.expected = {
      success: false,
      exitCode: 1,
      ...(error ? { error } : {}),
    }
    return this
  }

  expectOutput(output: unknown): this {
    this.testCase.expected = {
      ...this.testCase.expected,
      output,
    }
    return this
  }

  expectExitCode(code: number): this {
    this.testCase.expected = {
      ...this.testCase.expected,
      exitCode: code,
    }
    return this
  }

  timeout(ms: number): this {
    this.testCase.timeout = ms
    return this
  }

  skip(): this {
    this.testCase.skip = true
    return this
  }

  only(): this {
    this.testCase.only = true
    return this
  }

  build(): TestCase {
    if (!this.testCase.name) {
      throw new Error('Test case name is required')
    }
    if (!this.testCase.input) {
      this.testCase.input = {}
    }
    if (!this.testCase.expected) {
      this.testCase.expected = { success: true }
    }
    return this.testCase as TestCase
  }
}

/**
 * Format test results for display
 */
export function formatTestResults(suiteResult: TestSuiteResult): string {
  const lines: string[] = []

  lines.push(`\nTest Suite: ${suiteResult.command}`)
  lines.push('='.repeat(50))

  for (const result of suiteResult.results) {
    const status = result.passed ? '✓' : '✗'
    lines.push(`${status} ${result.name} (${result.duration}ms)`)

    if (!result.passed) {
      for (const assertion of result.assertions) {
        if (!assertion.passed) {
          lines.push(`  - ${assertion.assertion}:`)
          lines.push(`    Expected: ${JSON.stringify(assertion.expected)}`)
          lines.push(`    Actual: ${JSON.stringify(assertion.actual)}`)
        }
      }
      if (result.error) {
        lines.push(`  Error: ${result.error}`)
      }
    }
  }

  lines.push('-'.repeat(50))
  lines.push(`Total: ${suiteResult.total}`)
  lines.push(`Passed: ${suiteResult.passed}`)
  lines.push(`Failed: ${suiteResult.failed}`)
  lines.push(`Skipped: ${suiteResult.skipped}`)
  lines.push(`Duration: ${suiteResult.duration}ms`)

  return lines.join('\n')
}
