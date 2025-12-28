/**
 * Command Permission Control System
 *
 * Provides per-command execution permissions with tool access control,
 * file system scope, network access rules, and permission presets.
 */

import { createLogger } from './logger'

const log = createLogger('command-permissions')

/**
 * Available tools that can be restricted
 */
export type ToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'delete'
  | 'execute'
  | 'search'
  | 'network'
  | 'shell'
  | 'git'
  | 'npm'
  | 'docker'
  | 'mcp'
  | 'task'
  | 'browser'

/**
 * File system access scope
 */
export interface FileSystemScope {
  // Root paths the command can access
  allowedPaths: string[]
  // Patterns to deny (takes precedence)
  deniedPatterns: string[]
  // File extensions allowed
  allowedExtensions: string[]
  // Max file size for read/write (bytes)
  maxFileSize: number
  // Allow write operations
  canWrite: boolean
  // Allow delete operations
  canDelete: boolean
  // Allow creating new files
  canCreate: boolean
}

/**
 * Network access rules
 */
export interface NetworkAccess {
  // Enable network access
  enabled: boolean
  // Allowed hosts/domains
  allowedHosts: string[]
  // Denied hosts (takes precedence)
  deniedHosts: string[]
  // Allowed ports
  allowedPorts: number[]
  // Max concurrent connections
  maxConnections: number
  // Request timeout (ms)
  timeout: number
  // Allow localhost access
  allowLocalhost: boolean
}

/**
 * Command execution limits
 */
export interface ExecutionLimits {
  // Max execution time (ms)
  maxDuration: number
  // Max memory usage (bytes)
  maxMemory: number
  // Max CPU time (ms)
  maxCpuTime: number
  // Max concurrent executions
  maxConcurrent: number
  // Rate limit (executions per minute)
  rateLimit: number
}

/**
 * Full command permission configuration
 */
export interface CommandPermission {
  // Command identifier
  commandId: string
  // Permission preset name
  presetName?: string
  // Tools this command can use
  allowedTools: ToolName[]
  // Tools explicitly denied
  deniedTools: ToolName[]
  // File system access scope
  fileSystem: FileSystemScope
  // Network access rules
  network: NetworkAccess
  // Execution limits
  limits: ExecutionLimits
  // Custom metadata
  metadata?: Record<string, unknown>
  // Last updated timestamp
  updatedAt: number
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  violations: string[]
  checkedAt: number
}

/**
 * Default file system scope
 */
const defaultFileSystemScope: FileSystemScope = {
  allowedPaths: [process.cwd()],
  deniedPatterns: ['**/node_modules/**', '**/.git/**', '**/.env*', '**/secrets/**'],
  allowedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  canWrite: false,
  canDelete: false,
  canCreate: false,
}

/**
 * Default network access
 */
const defaultNetworkAccess: NetworkAccess = {
  enabled: false,
  allowedHosts: [],
  deniedHosts: ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'],
  allowedPorts: [80, 443],
  maxConnections: 10,
  timeout: 30000,
  allowLocalhost: false,
}

/**
 * Default execution limits
 */
const defaultExecutionLimits: ExecutionLimits = {
  maxDuration: 30000, // 30 seconds
  maxMemory: 256 * 1024 * 1024, // 256MB
  maxCpuTime: 15000, // 15 seconds
  maxConcurrent: 1,
  rateLimit: 10, // 10 per minute
}

/**
 * Permission presets for common use cases
 */
export const PermissionPresets: Record<string, Omit<CommandPermission, 'commandId'>> = {
  // Read-only: Can only read files, no write/network
  readonly: {
    presetName: 'readonly',
    allowedTools: ['read', 'search'],
    deniedTools: ['write', 'edit', 'delete', 'execute', 'shell', 'network'],
    fileSystem: {
      ...defaultFileSystemScope,
      canWrite: false,
      canDelete: false,
      canCreate: false,
    },
    network: {
      ...defaultNetworkAccess,
      enabled: false,
    },
    limits: defaultExecutionLimits,
    updatedAt: Date.now(),
  },

  // Editor: Can read and edit existing files
  editor: {
    presetName: 'editor',
    allowedTools: ['read', 'write', 'edit', 'search'],
    deniedTools: ['delete', 'shell', 'docker'],
    fileSystem: {
      ...defaultFileSystemScope,
      canWrite: true,
      canDelete: false,
      canCreate: false,
    },
    network: {
      ...defaultNetworkAccess,
      enabled: false,
    },
    limits: defaultExecutionLimits,
    updatedAt: Date.now(),
  },

  // Developer: Full file access with network for package management
  developer: {
    presetName: 'developer',
    allowedTools: ['read', 'write', 'edit', 'delete', 'search', 'git', 'npm', 'shell'],
    deniedTools: ['docker'],
    fileSystem: {
      ...defaultFileSystemScope,
      canWrite: true,
      canDelete: true,
      canCreate: true,
    },
    network: {
      ...defaultNetworkAccess,
      enabled: true,
      allowedHosts: ['registry.npmjs.org', 'github.com', 'api.github.com', '*.githubusercontent.com'],
      allowLocalhost: false,
    },
    limits: {
      ...defaultExecutionLimits,
      maxDuration: 60000, // 1 minute
      maxConcurrent: 3,
    },
    updatedAt: Date.now(),
  },

  // API Client: Network access for API calls, no file write
  apiClient: {
    presetName: 'apiClient',
    allowedTools: ['read', 'search', 'network', 'mcp'],
    deniedTools: ['write', 'edit', 'delete', 'shell', 'docker'],
    fileSystem: {
      ...defaultFileSystemScope,
      canWrite: false,
      canDelete: false,
      canCreate: false,
    },
    network: {
      ...defaultNetworkAccess,
      enabled: true,
      allowedHosts: ['*'],
      deniedHosts: ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'],
      maxConnections: 20,
    },
    limits: defaultExecutionLimits,
    updatedAt: Date.now(),
  },

  // Automation: Full access for automation tasks
  automation: {
    presetName: 'automation',
    allowedTools: ['read', 'write', 'edit', 'delete', 'execute', 'search', 'network', 'shell', 'git', 'npm', 'mcp', 'task', 'browser'],
    deniedTools: [],
    fileSystem: {
      allowedPaths: [process.cwd()],
      deniedPatterns: ['**/secrets/**', '**/.ssh/**', '**/credentials*'],
      allowedExtensions: ['*'],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      canWrite: true,
      canDelete: true,
      canCreate: true,
    },
    network: {
      enabled: true,
      allowedHosts: ['*'],
      deniedHosts: ['169.254.169.254'], // AWS metadata
      allowedPorts: [],
      maxConnections: 50,
      timeout: 60000,
      allowLocalhost: true,
    },
    limits: {
      maxDuration: 300000, // 5 minutes
      maxMemory: 1024 * 1024 * 1024, // 1GB
      maxCpuTime: 120000, // 2 minutes
      maxConcurrent: 10,
      rateLimit: 60, // 60 per minute
    },
    updatedAt: Date.now(),
  },

  // Restricted: Minimal permissions for untrusted commands
  restricted: {
    presetName: 'restricted',
    allowedTools: ['read'],
    deniedTools: ['write', 'edit', 'delete', 'execute', 'shell', 'network', 'docker', 'git', 'npm', 'mcp', 'task', 'browser'],
    fileSystem: {
      allowedPaths: [],
      deniedPatterns: ['**/*'],
      allowedExtensions: ['.md', '.txt'],
      maxFileSize: 1 * 1024 * 1024, // 1MB
      canWrite: false,
      canDelete: false,
      canCreate: false,
    },
    network: {
      ...defaultNetworkAccess,
      enabled: false,
    },
    limits: {
      maxDuration: 5000, // 5 seconds
      maxMemory: 50 * 1024 * 1024, // 50MB
      maxCpuTime: 3000, // 3 seconds
      maxConcurrent: 1,
      rateLimit: 5,
    },
    updatedAt: Date.now(),
  },
}

/**
 * Create command permission from preset
 */
export function createPermissionFromPreset(
  commandId: string,
  presetName: keyof typeof PermissionPresets,
  overrides?: Partial<CommandPermission>
): CommandPermission {
  const preset = PermissionPresets[presetName]
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`)
  }

  return {
    commandId,
    ...preset,
    ...overrides,
    fileSystem: { ...preset.fileSystem, ...overrides?.fileSystem },
    network: { ...preset.network, ...overrides?.network },
    limits: { ...preset.limits, ...overrides?.limits },
    updatedAt: Date.now(),
  }
}

/**
 * Create custom command permission
 */
export function createCustomPermission(
  commandId: string,
  config: Partial<Omit<CommandPermission, 'commandId'>>
): CommandPermission {
  return {
    commandId,
    allowedTools: config.allowedTools || ['read'],
    deniedTools: config.deniedTools || [],
    fileSystem: { ...defaultFileSystemScope, ...config.fileSystem },
    network: { ...defaultNetworkAccess, ...config.network },
    limits: { ...defaultExecutionLimits, ...config.limits },
    metadata: config.metadata,
    updatedAt: Date.now(),
  }
}

/**
 * Check if a tool is allowed for the command
 */
export function isToolAllowed(
  permission: CommandPermission,
  tool: ToolName
): PermissionCheckResult {
  const violations: string[] = []

  // Check denied tools first (takes precedence)
  if (permission.deniedTools.includes(tool)) {
    violations.push(`Tool "${tool}" is explicitly denied`)
    log.debug(`Tool ${tool} denied for ${permission.commandId}`)
    return {
      allowed: false,
      reason: `Tool "${tool}" is explicitly denied`,
      violations,
      checkedAt: Date.now(),
    }
  }

  // Check allowed tools
  if (!permission.allowedTools.includes(tool)) {
    violations.push(`Tool "${tool}" is not in allowed tools list`)
    log.debug(`Tool ${tool} not allowed for ${permission.commandId}`)
    return {
      allowed: false,
      reason: `Tool "${tool}" is not in allowed tools list`,
      violations,
      checkedAt: Date.now(),
    }
  }

  return {
    allowed: true,
    violations: [],
    checkedAt: Date.now(),
  }
}

/**
 * Check if file path is allowed
 */
export function isPathAllowed(
  permission: CommandPermission,
  filePath: string,
  operation: 'read' | 'write' | 'delete' | 'create'
): PermissionCheckResult {
  const violations: string[] = []
  const fs = permission.fileSystem

  // Check operation permissions
  if (operation === 'write' && !fs.canWrite) {
    violations.push('Write operations not allowed')
  }
  if (operation === 'delete' && !fs.canDelete) {
    violations.push('Delete operations not allowed')
  }
  if (operation === 'create' && !fs.canCreate) {
    violations.push('Create operations not allowed')
  }

  if (violations.length > 0) {
    return {
      allowed: false,
      reason: violations.join('; '),
      violations,
      checkedAt: Date.now(),
    }
  }

  // Check denied patterns
  for (const pattern of fs.deniedPatterns) {
    if (matchGlobPattern(filePath, pattern)) {
      violations.push(`Path matches denied pattern: ${pattern}`)
      return {
        allowed: false,
        reason: `Path matches denied pattern: ${pattern}`,
        violations,
        checkedAt: Date.now(),
      }
    }
  }

  // Check allowed paths
  const isInAllowedPath = fs.allowedPaths.some(
    (allowed) => filePath.startsWith(allowed) || allowed === '*'
  )

  if (!isInAllowedPath && fs.allowedPaths.length > 0) {
    violations.push('Path not in allowed paths')
    return {
      allowed: false,
      reason: 'Path not in allowed paths',
      violations,
      checkedAt: Date.now(),
    }
  }

  // Check file extension for read/write/create
  if (['read', 'write', 'create'].includes(operation)) {
    const ext = getFileExtension(filePath)
    if (ext && fs.allowedExtensions[0] !== '*') {
      if (!fs.allowedExtensions.includes(ext)) {
        violations.push(`Extension "${ext}" not allowed`)
        return {
          allowed: false,
          reason: `Extension "${ext}" not allowed`,
          violations,
          checkedAt: Date.now(),
        }
      }
    }
  }

  return {
    allowed: true,
    violations: [],
    checkedAt: Date.now(),
  }
}

/**
 * Check if network access is allowed for a host
 */
export function isNetworkAllowed(
  permission: CommandPermission,
  host: string,
  port?: number
): PermissionCheckResult {
  const violations: string[] = []
  const network = permission.network

  // Check if network is enabled
  if (!network.enabled) {
    violations.push('Network access is disabled')
    return {
      allowed: false,
      reason: 'Network access is disabled',
      violations,
      checkedAt: Date.now(),
    }
  }

  // Check localhost
  const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)
  if (isLocalhost && !network.allowLocalhost) {
    violations.push('Localhost access is disabled')
    return {
      allowed: false,
      reason: 'Localhost access is disabled',
      violations,
      checkedAt: Date.now(),
    }
  }

  // Check denied hosts first
  for (const denied of network.deniedHosts) {
    if (matchHostPattern(host, denied)) {
      violations.push(`Host "${host}" is denied`)
      return {
        allowed: false,
        reason: `Host "${host}" is denied`,
        violations,
        checkedAt: Date.now(),
      }
    }
  }

  // Check allowed hosts
  const isHostAllowed = network.allowedHosts.length === 0 ||
    network.allowedHosts.some((allowed) => matchHostPattern(host, allowed))

  if (!isHostAllowed) {
    violations.push(`Host "${host}" not in allowed hosts`)
    return {
      allowed: false,
      reason: `Host "${host}" not in allowed hosts`,
      violations,
      checkedAt: Date.now(),
    }
  }

  // Check port if specified
  if (port !== undefined && network.allowedPorts.length > 0) {
    if (!network.allowedPorts.includes(port)) {
      violations.push(`Port ${port} not allowed`)
      return {
        allowed: false,
        reason: `Port ${port} not allowed`,
        violations,
        checkedAt: Date.now(),
      }
    }
  }

  return {
    allowed: true,
    violations: [],
    checkedAt: Date.now(),
  }
}

/**
 * Check execution limits
 */
export function checkExecutionLimits(
  permission: CommandPermission,
  context: {
    duration?: number
    memory?: number
    cpuTime?: number
    concurrentCount?: number
    recentExecutions?: number
  }
): PermissionCheckResult {
  const violations: string[] = []
  const limits = permission.limits

  if (context.duration !== undefined && context.duration > limits.maxDuration) {
    violations.push(`Duration ${context.duration}ms exceeds limit ${limits.maxDuration}ms`)
  }

  if (context.memory !== undefined && context.memory > limits.maxMemory) {
    violations.push(`Memory ${context.memory} exceeds limit ${limits.maxMemory}`)
  }

  if (context.cpuTime !== undefined && context.cpuTime > limits.maxCpuTime) {
    violations.push(`CPU time ${context.cpuTime}ms exceeds limit ${limits.maxCpuTime}ms`)
  }

  if (context.concurrentCount !== undefined && context.concurrentCount >= limits.maxConcurrent) {
    violations.push(`Concurrent count ${context.concurrentCount} at limit ${limits.maxConcurrent}`)
  }

  if (context.recentExecutions !== undefined && context.recentExecutions >= limits.rateLimit) {
    violations.push(`Rate limit reached: ${context.recentExecutions}/${limits.rateLimit} per minute`)
  }

  if (violations.length > 0) {
    return {
      allowed: false,
      reason: violations.join('; '),
      violations,
      checkedAt: Date.now(),
    }
  }

  return {
    allowed: true,
    violations: [],
    checkedAt: Date.now(),
  }
}

/**
 * Comprehensive permission check
 */
export function checkPermission(
  permission: CommandPermission,
  request: {
    tool?: ToolName
    filePath?: string
    fileOperation?: 'read' | 'write' | 'delete' | 'create'
    host?: string
    port?: number
    executionContext?: {
      duration?: number
      memory?: number
      cpuTime?: number
      concurrentCount?: number
      recentExecutions?: number
    }
  }
): PermissionCheckResult {
  const allViolations: string[] = []

  // Check tool permission
  if (request.tool) {
    const toolResult = isToolAllowed(permission, request.tool)
    if (!toolResult.allowed) {
      allViolations.push(...toolResult.violations)
    }
  }

  // Check file path permission
  if (request.filePath && request.fileOperation) {
    const pathResult = isPathAllowed(permission, request.filePath, request.fileOperation)
    if (!pathResult.allowed) {
      allViolations.push(...pathResult.violations)
    }
  }

  // Check network permission
  if (request.host) {
    const networkResult = isNetworkAllowed(permission, request.host, request.port)
    if (!networkResult.allowed) {
      allViolations.push(...networkResult.violations)
    }
  }

  // Check execution limits
  if (request.executionContext) {
    const limitsResult = checkExecutionLimits(permission, request.executionContext)
    if (!limitsResult.allowed) {
      allViolations.push(...limitsResult.violations)
    }
  }

  if (allViolations.length > 0) {
    log.warn(`Permission denied for ${permission.commandId}`, { violations: allViolations })
    return {
      allowed: false,
      reason: allViolations[0],
      violations: allViolations,
      checkedAt: Date.now(),
    }
  }

  return {
    allowed: true,
    violations: [],
    checkedAt: Date.now(),
  }
}

/**
 * List available presets
 */
export function listPresets(): string[] {
  return Object.keys(PermissionPresets)
}

/**
 * Get preset details
 */
export function getPresetDetails(presetName: string): Omit<CommandPermission, 'commandId'> | undefined {
  return PermissionPresets[presetName]
}

// Helper functions

function matchGlobPattern(path: string, pattern: string): boolean {
  // Simple glob matching
  const regex = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/{{GLOBSTAR}}/g, '.*')

  return new RegExp(`^${regex}$`).test(path)
}

function matchHostPattern(host: string, pattern: string): boolean {
  if (pattern === '*') return true

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1) // Remove the '*'
    return host.endsWith(suffix) || host === pattern.slice(2)
  }

  return host === pattern
}

function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filePath.slice(lastDot)
}
