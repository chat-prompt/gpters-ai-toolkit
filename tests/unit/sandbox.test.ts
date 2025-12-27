import { describe, it, expect, vi } from 'vitest'
import {
  Sandbox,
  SandboxPresets,
  createSandbox,
  executeInSandbox,
  validateSandboxConfig,
  mergeSandboxConfig,
} from '@/lib/sandbox'

describe('Sandbox', () => {
  describe('SandboxPresets', () => {
    it('should have strict preset', () => {
      expect(SandboxPresets.strict).toBeDefined()
      expect(SandboxPresets.strict.maxExecutionTime).toBe(5000)
      expect(SandboxPresets.strict.allowNetwork).toBe(false)
      expect(SandboxPresets.strict.allowShellCommands).toBe(false)
    })

    it('should have standard preset', () => {
      expect(SandboxPresets.standard).toBeDefined()
      expect(SandboxPresets.standard.maxExecutionTime).toBe(30000)
      expect(SandboxPresets.standard.allowNetwork).toBe(true)
    })

    it('should have permissive preset', () => {
      expect(SandboxPresets.permissive).toBeDefined()
      expect(SandboxPresets.permissive.maxExecutionTime).toBe(300000)
    })
  })

  describe('createSandbox', () => {
    it('should create sandbox with preset name', () => {
      const sandbox = createSandbox('strict')
      expect(sandbox.getConfig().maxExecutionTime).toBe(5000)
    })

    it('should create sandbox with custom config', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        maxExecutionTime: 10000,
      })
      expect(sandbox.getConfig().maxExecutionTime).toBe(10000)
    })
  })

  describe('Path Access', () => {
    it('should allow paths in allowedPaths', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.strict,
        allowedPaths: ['/tmp', '/home/user'],
        deniedPaths: [],
      })
      expect(sandbox.isPathAllowed('/tmp/test.txt')).toBe(true)
      expect(sandbox.isPathAllowed('/home/user/file.js')).toBe(true)
    })

    it('should deny paths in deniedPaths', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        deniedPaths: ['/etc/passwd', '/etc/shadow'],
      })
      expect(sandbox.isPathAllowed('/etc/passwd')).toBe(false)
      expect(sandbox.isPathAllowed('/etc/shadow')).toBe(false)
    })

    it('should deny all paths when allowedPaths is empty', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.strict,
        allowedPaths: [],
        deniedPaths: [],
      })
      expect(sandbox.isPathAllowed('/any/path')).toBe(false)
    })

    it('should record violations', () => {
      const sandbox = createSandbox('strict')
      sandbox.isPathAllowed('/etc/passwd')
      const violations = sandbox.getViolations()
      expect(violations).toHaveLength(1)
      expect(violations[0].type).toBe('path')
      expect(violations[0].blocked).toBe(true)
    })
  })

  describe('Network Access', () => {
    it('should deny all hosts when network is disabled', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.strict,
        allowNetwork: false,
      })
      expect(sandbox.isHostAllowed('google.com')).toBe(false)
    })

    it('should allow hosts in allowedHosts', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        allowedHosts: ['api.example.com', '*.github.com'],
        deniedHosts: [],
      })
      expect(sandbox.isHostAllowed('api.example.com')).toBe(true)
    })

    it('should deny hosts in deniedHosts', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        deniedHosts: ['localhost', '127.0.0.1'],
      })
      expect(sandbox.isHostAllowed('localhost')).toBe(false)
      expect(sandbox.isHostAllowed('127.0.0.1')).toBe(false)
    })

    it('should allow all hosts with wildcard', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        allowedHosts: ['*'],
        deniedHosts: [],
      })
      expect(sandbox.isHostAllowed('any.domain.com')).toBe(true)
    })
  })

  describe('Environment Variables', () => {
    it('should allow env vars in allowedEnvVars', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        allowedEnvVars: ['NODE_ENV', 'PATH'],
        deniedEnvVars: [],
      })
      expect(sandbox.isEnvVarAllowed('NODE_ENV')).toBe(true)
      expect(sandbox.isEnvVarAllowed('PATH')).toBe(true)
    })

    it('should deny env vars in deniedEnvVars', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        deniedEnvVars: ['AWS_SECRET_ACCESS_KEY', 'DATABASE_URL'],
      })
      expect(sandbox.isEnvVarAllowed('AWS_SECRET_ACCESS_KEY')).toBe(false)
    })

    it('should deny all with wildcard in deniedEnvVars', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.strict,
        deniedEnvVars: ['*'],
      })
      expect(sandbox.isEnvVarAllowed('ANY_VAR')).toBe(false)
    })
  })

  describe('Command Execution', () => {
    it('should deny all commands when shell is disabled', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.strict,
        allowShellCommands: false,
      })
      expect(sandbox.isCommandAllowed('ls')).toBe(false)
    })

    it('should allow commands in allowedCommands', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        allowedCommands: ['node', 'npm', 'git'],
        deniedCommands: [],
      })
      expect(sandbox.isCommandAllowed('node script.js')).toBe(true)
      expect(sandbox.isCommandAllowed('npm install')).toBe(true)
    })

    it('should deny commands in deniedCommands', () => {
      const sandbox = createSandbox({
        ...SandboxPresets.standard,
        deniedCommands: ['rm -rf', 'sudo'],
      })
      expect(sandbox.isCommandAllowed('rm -rf /')).toBe(false)
      expect(sandbox.isCommandAllowed('sudo apt install')).toBe(false)
    })
  })

  describe('execute', () => {
    it('should execute successful function', async () => {
      const sandbox = createSandbox('standard')
      const result = await sandbox.execute(async () => {
        return 'success'
      })

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.executionTime).toBeGreaterThanOrEqual(0)
    })

    it('should handle function errors', async () => {
      const sandbox = createSandbox('standard')
      const result = await sandbox.execute(async () => {
        throw new Error('Test error')
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Test error')
    })

    it('should timeout long-running functions', async () => {
      const sandbox = createSandbox({
        ...SandboxPresets.strict,
        maxExecutionTime: 50, // 50ms timeout
      })

      const result = await sandbox.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return 'done'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Execution timeout')
    })

    it('should record violations', async () => {
      const sandbox = createSandbox('strict')
      await sandbox.execute(async () => {
        sandbox.isPathAllowed('/etc/passwd')
        sandbox.isHostAllowed('google.com')
        return 'done'
      })

      const violations = sandbox.getViolations()
      expect(violations.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('executeInSandbox', () => {
    it('should execute with default config', async () => {
      const result = await executeInSandbox(async () => 'test')
      expect(result.success).toBe(true)
      expect(result.result).toBe('test')
    })

    it('should execute with custom preset', async () => {
      const result = await executeInSandbox(async () => 42, 'strict')
      expect(result.success).toBe(true)
      expect(result.result).toBe(42)
    })
  })

  describe('validateSandboxConfig', () => {
    it('should validate valid config', () => {
      const result = validateSandboxConfig({
        maxExecutionTime: 1000,
        maxMemory: 1024,
        maxCpuTime: 500,
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid maxExecutionTime', () => {
      const result = validateSandboxConfig({ maxExecutionTime: -1 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('maxExecutionTime must be positive')
    })

    it('should reject invalid maxMemory', () => {
      const result = validateSandboxConfig({ maxMemory: 0 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('maxMemory must be positive')
    })
  })

  describe('mergeSandboxConfig', () => {
    it('should merge configs', () => {
      const base = SandboxPresets.standard
      const merged = mergeSandboxConfig(base, {
        maxExecutionTime: 60000,
        allowNetwork: false,
      })

      expect(merged.maxExecutionTime).toBe(60000)
      expect(merged.allowNetwork).toBe(false)
      expect(merged.maxMemory).toBe(base.maxMemory)
    })

    it('should override arrays when specified', () => {
      const base = SandboxPresets.standard
      const merged = mergeSandboxConfig(base, {
        allowedPaths: ['/custom/path'],
      })

      expect(merged.allowedPaths).toEqual(['/custom/path'])
    })
  })
})
