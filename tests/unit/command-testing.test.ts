import { describe, it, expect } from 'vitest'
import {
  parseArguments,
  validateOutput,
  createMockHandler,
  executeWithMock,
  runTestCase,
  runTestSuite,
  TestCaseBuilder,
  formatTestResults,
  type CommandDefinition,
  type CommandResult,
  type TestCase,
} from '@/lib/command/testing'

describe('Command Testing Framework', () => {
  // Sample command definition for testing
  const sampleCommand: CommandDefinition = {
    name: 'greet',
    description: 'Greets a user',
    arguments: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Name to greet',
      },
      {
        name: 'count',
        type: 'number',
        required: false,
        default: 1,
        description: 'Number of times to greet',
        aliases: ['n', 'times'],
      },
      {
        name: 'loud',
        type: 'boolean',
        required: false,
        default: false,
        description: 'Use uppercase',
      },
      {
        name: 'tags',
        type: 'array',
        required: false,
        default: [],
        description: 'Tags to add',
      },
    ],
    handler: async (args) => {
      const name = args.name as string
      const count = args.count as number
      const loud = args.loud as boolean

      let greeting = `Hello, ${name}!`
      if (loud) greeting = greeting.toUpperCase()

      const output = Array(count).fill(greeting).join(' ')

      return {
        success: true,
        exitCode: 0,
        output,
        stdout: output,
      }
    },
  }

  describe('parseArguments', () => {
    it('should parse required arguments', () => {
      const result = parseArguments(sampleCommand, { name: 'Alice' })
      expect(result.valid).toBe(true)
      expect(result.args.name).toBe('Alice')
    })

    it('should apply default values', () => {
      const result = parseArguments(sampleCommand, { name: 'Bob' })
      expect(result.args.count).toBe(1)
      expect(result.args.loud).toBe(false)
    })

    it('should report missing required arguments', () => {
      const result = parseArguments(sampleCommand, {})
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing required argument: name')
    })

    it('should coerce number type', () => {
      const result = parseArguments(sampleCommand, { name: 'Test', count: '5' })
      expect(result.args.count).toBe(5)
    })

    it('should coerce boolean type', () => {
      const result = parseArguments(sampleCommand, { name: 'Test', loud: 'true' })
      expect(result.args.loud).toBe(true)
    })

    it('should coerce array type from string', () => {
      const result = parseArguments(sampleCommand, { name: 'Test', tags: 'a,b,c' })
      expect(result.args.tags).toEqual(['a', 'b', 'c'])
    })

    it('should handle invalid number coercion', () => {
      const result = parseArguments(sampleCommand, { name: 'Test', count: 'abc' })
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('Cannot convert')
    })

    it('should support argument aliases', () => {
      const result = parseArguments(sampleCommand, { name: 'Test', n: 3 })
      expect(result.args.count).toBe(3)
    })

    it('should identify unknown arguments', () => {
      const result = parseArguments(sampleCommand, { name: 'Test', unknown: 'value' })
      expect(result.unknownArgs).toContain('unknown')
    })

    it('should support custom validation', () => {
      const cmdWithValidation: CommandDefinition = {
        ...sampleCommand,
        arguments: [
          {
            name: 'age',
            type: 'number',
            required: true,
            validate: (val) => {
              const num = val as number
              if (num < 0) return 'Age must be positive'
              if (num > 150) return 'Age seems too high'
              return true
            },
          },
        ],
      }

      const validResult = parseArguments(cmdWithValidation, { age: 25 })
      expect(validResult.valid).toBe(true)

      const invalidResult = parseArguments(cmdWithValidation, { age: -5 })
      expect(invalidResult.valid).toBe(false)
      expect(invalidResult.errors[0]).toContain('Age must be positive')
    })
  })

  describe('validateOutput', () => {
    const actualResult: CommandResult = {
      success: true,
      exitCode: 0,
      output: { message: 'Hello' },
      stdout: 'Hello\n',
      stderr: '',
    }

    it('should validate success status', () => {
      const assertions = validateOutput(actualResult, { success: true })
      expect(assertions.find((a) => a.assertion === 'success status')?.passed).toBe(true)
    })

    it('should validate exit code', () => {
      const assertions = validateOutput(actualResult, { exitCode: 0 })
      expect(assertions.find((a) => a.assertion === 'exit code')?.passed).toBe(true)
    })

    it('should validate output with deep equality', () => {
      const assertions = validateOutput(actualResult, {
        output: { message: 'Hello' },
      })
      expect(assertions.find((a) => a.assertion === 'output')?.passed).toBe(true)
    })

    it('should fail on mismatched output', () => {
      const assertions = validateOutput(actualResult, {
        output: { message: 'Goodbye' },
      })
      expect(assertions.find((a) => a.assertion === 'output')?.passed).toBe(false)
    })

    it('should validate stdout contains expected', () => {
      const assertions = validateOutput(actualResult, { stdout: 'Hello' })
      expect(assertions.find((a) => a.assertion === 'stdout')?.passed).toBe(true)
    })
  })

  describe('MockHandler', () => {
    it('should create a mock handler', () => {
      const mock = createMockHandler()
      expect(mock.callCount).toBe(0)
      expect(mock.calls).toHaveLength(0)
    })

    it('should track calls', async () => {
      const mock = createMockHandler()
      await executeWithMock(sampleCommand, { name: 'Test' }, mock)

      expect(mock.callCount).toBe(1)
      expect(mock.calls[0].args.name).toBe('Test')
    })

    it('should return mock value', async () => {
      const mock = createMockHandler({
        returnValue: {
          success: true,
          exitCode: 0,
          output: 'mocked output',
        },
      })

      const result = await executeWithMock(sampleCommand, { name: 'Test' }, mock)
      expect(result.output).toBe('mocked output')
    })

    it('should throw mock error', async () => {
      const mock = createMockHandler({
        throwError: new Error('Mock error'),
      })

      await expect(
        executeWithMock(sampleCommand, { name: 'Test' }, mock)
      ).rejects.toThrow('Mock error')
    })

    it('should apply delay', async () => {
      const mock = createMockHandler({ delay: 50 })
      const start = Date.now()
      await executeWithMock(sampleCommand, { name: 'Test' }, mock)
      expect(Date.now() - start).toBeGreaterThanOrEqual(50)
    })
  })

  describe('runTestCase', () => {
    it('should run successful test case', async () => {
      const testCase: TestCase = {
        name: 'basic greeting',
        input: { name: 'Alice' },
        expected: { success: true, exitCode: 0 },
      }

      const result = await runTestCase(sampleCommand, testCase)
      expect(result.passed).toBe(true)
      expect(result.name).toBe('basic greeting')
    })

    it('should detect failed assertion', async () => {
      const testCase: TestCase = {
        name: 'wrong output',
        input: { name: 'Alice' },
        expected: { output: 'wrong value' },
      }

      const result = await runTestCase(sampleCommand, testCase)
      expect(result.passed).toBe(false)
    })

    it('should handle argument parsing errors', async () => {
      const testCase: TestCase = {
        name: 'missing required',
        input: {},
        expected: { success: false },
      }

      const result = await runTestCase(sampleCommand, testCase)
      expect(result.passed).toBe(true) // Expected failure
    })

    it('should use mock handler when provided', async () => {
      const mock = createMockHandler({
        returnValue: {
          success: true,
          exitCode: 0,
          output: 'mocked',
        },
      })

      const testCase: TestCase = {
        name: 'with mock',
        input: { name: 'Test' },
        expected: { output: 'mocked' },
      }

      const result = await runTestCase(sampleCommand, testCase, mock)
      expect(result.passed).toBe(true)
      expect(mock.callCount).toBe(1)
    })

    it('should handle expected errors', async () => {
      const errorCommand: CommandDefinition = {
        ...sampleCommand,
        handler: async () => {
          throw new Error('Command failed')
        },
      }

      const testCase: TestCase = {
        name: 'expect error',
        input: { name: 'Test' },
        expected: { success: false, error: 'Command failed' },
      }

      const result = await runTestCase(errorCommand, testCase)
      expect(result.passed).toBe(true)
    })
  })

  describe('runTestSuite', () => {
    const testCases: TestCase[] = [
      {
        name: 'test 1',
        input: { name: 'Alice' },
        expected: { success: true },
      },
      {
        name: 'test 2',
        input: { name: 'Bob', count: 2 },
        expected: { success: true },
      },
      {
        name: 'test 3 - skip',
        input: { name: 'Skip' },
        expected: { success: true },
        skip: true,
      },
    ]

    it('should run all test cases', async () => {
      const result = await runTestSuite(sampleCommand, testCases)
      expect(result.total).toBe(3)
      expect(result.passed).toBe(3) // Skipped tests count as passed
      expect(result.skipped).toBe(1)
    })

    it('should run tests in parallel', async () => {
      const result = await runTestSuite(sampleCommand, testCases, {
        parallel: true,
      })
      expect(result.passed).toBe(3) // Skipped tests count as passed
    })

    it('should stop on failure when configured', async () => {
      const failingCases: TestCase[] = [
        {
          name: 'pass first',
          input: { name: 'Test' },
          expected: { success: true },
        },
        {
          name: 'fail second',
          input: { name: 'Test' },
          expected: { output: 'wrong' },
        },
        {
          name: 'should not run',
          input: { name: 'Test' },
          expected: { success: true },
        },
      ]

      const result = await runTestSuite(sampleCommand, failingCases, {
        stopOnFailure: true,
      })

      expect(result.results).toHaveLength(2)
    })

    it('should run only marked tests', async () => {
      const casesWithOnly: TestCase[] = [
        {
          name: 'regular test',
          input: { name: 'Test' },
          expected: { success: true },
        },
        {
          name: 'only this',
          input: { name: 'Test' },
          expected: { success: true },
          only: true,
        },
      ]

      const result = await runTestSuite(sampleCommand, casesWithOnly)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].name).toBe('only this')
    })
  })

  describe('TestCaseBuilder', () => {
    it('should build basic test case', () => {
      const testCase = TestCaseBuilder.create('my test')
        .input({ name: 'Alice' })
        .expectSuccess()
        .build()

      expect(testCase.name).toBe('my test')
      expect(testCase.input).toEqual({ name: 'Alice' })
      expect(testCase.expected.success).toBe(true)
    })

    it('should build test case with expected output', () => {
      const testCase = TestCaseBuilder.create('output test')
        .input({ name: 'Bob' })
        .expectSuccess()
        .expectOutput('Hello, Bob!')
        .build()

      expect(testCase.expected.output).toBe('Hello, Bob!')
    })

    it('should build failure test case', () => {
      const testCase = TestCaseBuilder.create('failure test')
        .input({})
        .expectFailure('Missing required')
        .build()

      expect(testCase.expected.success).toBe(false)
      expect(testCase.expected.error).toBe('Missing required')
    })

    it('should support chained configuration', () => {
      const testCase = TestCaseBuilder.create('complex test')
        .description('A complex test case')
        .input({ name: 'Test' })
        .expectSuccess({ value: 42 })
        .expectExitCode(0)
        .timeout(5000)
        .build()

      expect(testCase.description).toBe('A complex test case')
      expect(testCase.timeout).toBe(5000)
      expect(testCase.expected.output).toEqual({ value: 42 })
    })

    it('should support skip and only', () => {
      const skipCase = TestCaseBuilder.create('skip').input({}).skip().build()
      expect(skipCase.skip).toBe(true)

      const onlyCase = TestCaseBuilder.create('only').input({}).only().build()
      expect(onlyCase.only).toBe(true)
    })

    it('should throw without name', () => {
      expect(() => {
        new TestCaseBuilder().input({}).build() as unknown
      }).toThrow('Test case name is required')
    })
  })

  describe('formatTestResults', () => {
    it('should format passing results', async () => {
      const result = await runTestSuite(sampleCommand, [
        { name: 'test 1', input: { name: 'A' }, expected: { success: true } },
      ])

      const formatted = formatTestResults(result)
      expect(formatted).toContain('✓ test 1')
      expect(formatted).toContain('Passed: 1')
    })

    it('should format failing results with details', async () => {
      const result = await runTestSuite(sampleCommand, [
        { name: 'fail test', input: { name: 'A' }, expected: { output: 'wrong' } },
      ])

      const formatted = formatTestResults(result)
      expect(formatted).toContain('✗ fail test')
      expect(formatted).toContain('Expected:')
      expect(formatted).toContain('Actual:')
      expect(formatted).toContain('Failed: 1')
    })

    it('should include suite summary', async () => {
      const result = await runTestSuite(sampleCommand, [
        { name: 't1', input: { name: 'A' }, expected: { success: true } },
        { name: 't2', input: { name: 'B' }, expected: { success: true } },
        { name: 't3', input: { name: 'C' }, expected: { success: true }, skip: true },
      ])

      const formatted = formatTestResults(result)
      expect(formatted).toContain('Total: 3')
      expect(formatted).toContain('Passed: 3') // Skipped tests count as passed
      expect(formatted).toContain('Skipped: 1')
      expect(formatted).toContain('Duration:')
    })
  })
})
