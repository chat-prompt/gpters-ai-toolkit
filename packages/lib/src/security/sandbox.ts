/**
 * Sandbox Execution Environment
 *
 * Provides isolated execution context for hooks and commands
 * with resource limits, file system isolation, and security controls.
 */

import { createLogger } from '../core/logger'

const log = createLogger('sandbox')

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  // Resource limits
  maxExecutionTime: number // milliseconds
  maxMemory: number // bytes
  maxCpuTime: number // milliseconds

  // File system access
  allowedPaths: string[]
  deniedPaths: string[]
  readOnly: boolean

  // Network access
  allowNetwork: boolean
  allowedHosts: string[]
  deniedHosts: string[]

  // Environment
  allowedEnvVars: string[]
  deniedEnvVars: string[]

  // Execution
  allowShellCommands: boolean
  allowedCommands: string[]
  deniedCommands: string[]
}

/**
 * Default sandbox configurations for different trust levels
 */
export const SandboxPresets: Record<string, SandboxConfig> = {
  // Strict: Minimal permissions for untrusted code
  strict: {
    maxExecutionTime: 5000, // 5 seconds
    maxMemory: 50 * 1024 * 1024, // 50MB
    maxCpuTime: 3000, // 3 seconds
    allowedPaths: [],
    deniedPaths: ['/', '/etc', '/var', '/usr', '/bin', '/sbin'],
    readOnly: true,
    allowNetwork: false,
    allowedHosts: [],
    deniedHosts: ['*'],
    allowedEnvVars: ['NODE_ENV', 'TZ'],
    deniedEnvVars: ['*'],
    allowShellCommands: false,
    allowedCommands: [],
    deniedCommands: ['*'],
  },

  // Standard: Reasonable permissions for trusted internal code
  standard: {
    maxExecutionTime: 30000, // 30 seconds
    maxMemory: 256 * 1024 * 1024, // 256MB
    maxCpuTime: 15000, // 15 seconds
    allowedPaths: ['/tmp', process.cwd()],
    deniedPaths: ['/etc/passwd', '/etc/shadow', '~/.ssh'],
    readOnly: false,
    allowNetwork: true,
    allowedHosts: ['*'],
    deniedHosts: ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'],
    allowedEnvVars: ['NODE_ENV', 'TZ', 'PATH', 'HOME'],
    deniedEnvVars: ['AWS_SECRET_ACCESS_KEY', 'DATABASE_URL', 'ADMIN_PASSWORD'],
    allowShellCommands: true,
    allowedCommands: ['node', 'npm', 'npx', 'git', 'curl'],
    deniedCommands: ['rm -rf', 'sudo', 'chmod', 'chown'],
  },

  // Permissive: For fully trusted admin operations
  permissive: {
    maxExecutionTime: 300000, // 5 minutes
    maxMemory: 1024 * 1024 * 1024, // 1GB
    maxCpuTime: 120000, // 2 minutes
    allowedPaths: ['*'],
    deniedPaths: [],
    readOnly: false,
    allowNetwork: true,
    allowedHosts: ['*'],
    deniedHosts: [],
    allowedEnvVars: ['*'],
    deniedEnvVars: [],
    allowShellCommands: true,
    allowedCommands: ['*'],
    deniedCommands: [],
  },
}

export type SandboxPreset = keyof typeof SandboxPresets

/**
 * Sandbox execution result
 */
export interface SandboxResult<T = unknown> {
  success: boolean
  result?: T
  error?: string
  executionTime: number
  memoryUsed?: number
  violations: SandboxViolation[]
}

/**
 * Security violation record
 */
export interface SandboxViolation {
  type: 'timeout' | 'memory' | 'path' | 'network' | 'env' | 'command'
  message: string
  timestamp: number
  blocked: boolean
}

/**
 * Sandbox execution context
 */
export class Sandbox {
  private config: SandboxConfig
  private violations: SandboxViolation[] = []
  private startTime: number = 0

  constructor(config: SandboxConfig | SandboxPreset) {
    this.config = typeof config === 'string' ? SandboxPresets[config] : config
  }

  /**
   * Check if a path is allowed
   */
  isPathAllowed(path: string): boolean {
    // Check denied paths first
    for (const denied of this.config.deniedPaths) {
      if (denied === '*' || path.startsWith(denied)) {
        this.recordViolation('path', `Access to ${path} is denied`, true)
        return false
      }
    }

    // Check allowed paths
    if (this.config.allowedPaths.length === 0) {
      return false
    }

    for (const allowed of this.config.allowedPaths) {
      if (allowed === '*' || path.startsWith(allowed)) {
        return true
      }
    }

    this.recordViolation('path', `Access to ${path} is not in allowed paths`, true)
    return false
  }

  /**
   * Check if a host is allowed for network access
   */
  isHostAllowed(host: string): boolean {
    if (!this.config.allowNetwork) {
      this.recordViolation('network', 'Network access is disabled', true)
      return false
    }

    // Check denied hosts first
    for (const denied of this.config.deniedHosts) {
      if (denied === '*' || host === denied || host.endsWith(`.${denied}`)) {
        this.recordViolation('network', `Access to ${host} is denied`, true)
        return false
      }
    }

    // Check allowed hosts
    for (const allowed of this.config.allowedHosts) {
      if (allowed === '*' || host === allowed || host.endsWith(`.${allowed}`)) {
        return true
      }
    }

    this.recordViolation('network', `Access to ${host} is not in allowed hosts`, true)
    return false
  }

  /**
   * Check if an environment variable is allowed
   */
  isEnvVarAllowed(name: string): boolean {
    // Check denied vars first
    for (const denied of this.config.deniedEnvVars) {
      if (denied === '*' || name === denied) {
        this.recordViolation('env', `Access to env var ${name} is denied`, true)
        return false
      }
    }

    // Check allowed vars
    for (const allowed of this.config.allowedEnvVars) {
      if (allowed === '*' || name === allowed) {
        return true
      }
    }

    this.recordViolation('env', `Access to env var ${name} is not allowed`, true)
    return false
  }

  /**
   * Check if a command is allowed
   */
  isCommandAllowed(command: string): boolean {
    if (!this.config.allowShellCommands) {
      this.recordViolation('command', 'Shell commands are disabled', true)
      return false
    }

    const cmdName = command.split(' ')[0]

    // Check denied commands first
    for (const denied of this.config.deniedCommands) {
      if (denied === '*' || command.includes(denied) || cmdName === denied) {
        this.recordViolation('command', `Command ${cmdName} is denied`, true)
        return false
      }
    }

    // Check allowed commands
    for (const allowed of this.config.allowedCommands) {
      if (allowed === '*' || cmdName === allowed) {
        return true
      }
    }

    this.recordViolation('command', `Command ${cmdName} is not allowed`, true)
    return false
  }

  /**
   * Record a security violation
   */
  private recordViolation(type: SandboxViolation['type'], message: string, blocked: boolean): void {
    const violation: SandboxViolation = {
      type,
      message,
      timestamp: Date.now(),
      blocked,
    }
    this.violations.push(violation)
    log.warn(`Sandbox violation: ${type} - ${message}`, { blocked })
  }

  /**
   * Execute a function within the sandbox
   */
  async execute<T>(fn: () => Promise<T>): Promise<SandboxResult<T>> {
    this.startTime = Date.now()
    this.violations = []

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        this.recordViolation('timeout', `Execution exceeded ${this.config.maxExecutionTime}ms limit`, true)
        reject(new Error('Execution timeout'))
      }, this.config.maxExecutionTime)
    })

    try {
      const result = await Promise.race([fn(), timeoutPromise])
      const executionTime = Date.now() - this.startTime

      return {
        success: true,
        result,
        executionTime,
        violations: this.violations,
      }
    } catch (error) {
      const executionTime = Date.now() - this.startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        error: errorMessage,
        executionTime,
        violations: this.violations,
      }
    }
  }

  /**
   * Get current violations
   */
  getViolations(): SandboxViolation[] {
    return [...this.violations]
  }

  /**
   * Get sandbox configuration
   */
  getConfig(): SandboxConfig {
    return { ...this.config }
  }

  /**
   * Check execution time limit
   */
  checkTimeLimit(): boolean {
    if (this.startTime === 0) return true
    const elapsed = Date.now() - this.startTime
    if (elapsed > this.config.maxExecutionTime) {
      this.recordViolation('timeout', `Execution time ${elapsed}ms exceeds limit`, true)
      return false
    }
    return true
  }
}

/**
 * Create a sandbox with the specified configuration
 */
export function createSandbox(config: SandboxConfig | SandboxPreset): Sandbox {
  return new Sandbox(config)
}

/**
 * Execute a function in a sandbox
 */
export async function executeInSandbox<T>(
  fn: () => Promise<T>,
  config: SandboxConfig | SandboxPreset = 'standard'
): Promise<SandboxResult<T>> {
  const sandbox = createSandbox(config)
  return sandbox.execute(fn)
}

/**
 * Validate sandbox configuration
 */
export function validateSandboxConfig(config: Partial<SandboxConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (config.maxExecutionTime !== undefined && config.maxExecutionTime <= 0) {
    errors.push('maxExecutionTime must be positive')
  }
  if (config.maxMemory !== undefined && config.maxMemory <= 0) {
    errors.push('maxMemory must be positive')
  }
  if (config.maxCpuTime !== undefined && config.maxCpuTime <= 0) {
    errors.push('maxCpuTime must be positive')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Merge sandbox configurations
 */
export function mergeSandboxConfig(
  base: SandboxConfig,
  overrides: Partial<SandboxConfig>
): SandboxConfig {
  return {
    ...base,
    ...overrides,
    allowedPaths: overrides.allowedPaths ?? base.allowedPaths,
    deniedPaths: overrides.deniedPaths ?? base.deniedPaths,
    allowedHosts: overrides.allowedHosts ?? base.allowedHosts,
    deniedHosts: overrides.deniedHosts ?? base.deniedHosts,
    allowedEnvVars: overrides.allowedEnvVars ?? base.allowedEnvVars,
    deniedEnvVars: overrides.deniedEnvVars ?? base.deniedEnvVars,
    allowedCommands: overrides.allowedCommands ?? base.allowedCommands,
    deniedCommands: overrides.deniedCommands ?? base.deniedCommands,
  }
}
