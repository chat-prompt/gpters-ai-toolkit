import { describe, it, expect } from 'vitest'
import {
  PermissionPresets,
  createPermissionFromPreset,
  createCustomPermission,
  isToolAllowed,
  isPathAllowed,
  isNetworkAllowed,
  checkExecutionLimits,
  checkPermission,
  listPresets,
  getPresetDetails,
  type CommandPermission,
} from '@/lib/command/permissions'

describe('Command Permissions', () => {
  describe('PermissionPresets', () => {
    it('should have readonly preset', () => {
      expect(PermissionPresets.readonly).toBeDefined()
      expect(PermissionPresets.readonly.allowedTools).toContain('read')
      expect(PermissionPresets.readonly.deniedTools).toContain('write')
      expect(PermissionPresets.readonly.fileSystem.canWrite).toBe(false)
    })

    it('should have editor preset', () => {
      expect(PermissionPresets.editor).toBeDefined()
      expect(PermissionPresets.editor.allowedTools).toContain('write')
      expect(PermissionPresets.editor.fileSystem.canWrite).toBe(true)
      expect(PermissionPresets.editor.fileSystem.canDelete).toBe(false)
    })

    it('should have developer preset', () => {
      expect(PermissionPresets.developer).toBeDefined()
      expect(PermissionPresets.developer.allowedTools).toContain('git')
      expect(PermissionPresets.developer.allowedTools).toContain('npm')
      expect(PermissionPresets.developer.network.enabled).toBe(true)
    })

    it('should have apiClient preset', () => {
      expect(PermissionPresets.apiClient).toBeDefined()
      expect(PermissionPresets.apiClient.allowedTools).toContain('network')
      expect(PermissionPresets.apiClient.deniedTools).toContain('write')
    })

    it('should have automation preset', () => {
      expect(PermissionPresets.automation).toBeDefined()
      expect(PermissionPresets.automation.allowedTools.length).toBeGreaterThan(10)
      expect(PermissionPresets.automation.limits.maxDuration).toBe(300000)
    })

    it('should have restricted preset', () => {
      expect(PermissionPresets.restricted).toBeDefined()
      expect(PermissionPresets.restricted.allowedTools).toEqual(['read'])
      expect(PermissionPresets.restricted.limits.maxDuration).toBe(5000)
    })
  })

  describe('createPermissionFromPreset', () => {
    it('should create permission from readonly preset', () => {
      const permission = createPermissionFromPreset('my-command', 'readonly')
      expect(permission.commandId).toBe('my-command')
      expect(permission.presetName).toBe('readonly')
      expect(permission.allowedTools).toContain('read')
    })

    it('should apply overrides to preset', () => {
      const permission = createPermissionFromPreset('my-command', 'editor', {
        fileSystem: { canDelete: true },
      })
      expect(permission.fileSystem.canWrite).toBe(true)
      expect(permission.fileSystem.canDelete).toBe(true)
    })

    it('should throw for unknown preset', () => {
      expect(() => {
        createPermissionFromPreset('cmd', 'unknown' as keyof typeof PermissionPresets)
      }).toThrow('Unknown preset: unknown')
    })
  })

  describe('createCustomPermission', () => {
    it('should create custom permission with defaults', () => {
      const permission = createCustomPermission('custom-cmd', {})
      expect(permission.commandId).toBe('custom-cmd')
      expect(permission.allowedTools).toEqual(['read'])
      expect(permission.updatedAt).toBeDefined()
    })

    it('should create custom permission with specific config', () => {
      const permission = createCustomPermission('custom-cmd', {
        allowedTools: ['read', 'write', 'network'],
        network: { enabled: true },
      })
      expect(permission.allowedTools).toContain('network')
      expect(permission.network.enabled).toBe(true)
    })
  })

  describe('isToolAllowed', () => {
    let permission: CommandPermission

    beforeEach(() => {
      permission = createPermissionFromPreset('test-cmd', 'editor')
    })

    it('should allow tools in allowedTools', () => {
      const result = isToolAllowed(permission, 'read')
      expect(result.allowed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('should deny tools in deniedTools', () => {
      const result = isToolAllowed(permission, 'shell')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('explicitly denied')
    })

    it('should deny tools not in allowedTools', () => {
      const result = isToolAllowed(permission, 'browser')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('not in allowed tools')
    })

    it('should include timestamp in result', () => {
      const result = isToolAllowed(permission, 'read')
      expect(result.checkedAt).toBeDefined()
      expect(result.checkedAt).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('isPathAllowed', () => {
    let permission: CommandPermission

    beforeEach(() => {
      permission = createPermissionFromPreset('test-cmd', 'developer')
    })

    it('should allow read in allowed paths', () => {
      const result = isPathAllowed(permission, `${process.cwd()}/src/file.ts`, 'read')
      expect(result.allowed).toBe(true)
    })

    it('should deny path in denied patterns', () => {
      const result = isPathAllowed(permission, `${process.cwd()}/node_modules/package/index.js`, 'read')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('denied pattern')
    })

    it('should deny .env files', () => {
      const result = isPathAllowed(permission, `${process.cwd()}/.env.local`, 'read')
      expect(result.allowed).toBe(false)
    })

    it('should deny write when canWrite is false', () => {
      const readonlyPermission = createPermissionFromPreset('ro-cmd', 'readonly')
      const result = isPathAllowed(readonlyPermission, `${process.cwd()}/file.ts`, 'write')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Write operations not allowed')
    })

    it('should deny delete when canDelete is false', () => {
      const editorPermission = createPermissionFromPreset('ed-cmd', 'editor')
      const result = isPathAllowed(editorPermission, `${process.cwd()}/file.ts`, 'delete')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Delete operations not allowed')
    })

    it('should allow write when canWrite is true', () => {
      const result = isPathAllowed(permission, `${process.cwd()}/src/file.ts`, 'write')
      expect(result.allowed).toBe(true)
    })

    it('should check file extensions', () => {
      const readonlyPermission = createPermissionFromPreset('ro-cmd', 'readonly')
      const result = isPathAllowed(readonlyPermission, `${process.cwd()}/file.exe`, 'read')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Extension ".exe" not allowed')
    })
  })

  describe('isNetworkAllowed', () => {
    it('should deny when network is disabled', () => {
      const permission = createPermissionFromPreset('cmd', 'readonly')
      const result = isNetworkAllowed(permission, 'example.com')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Network access is disabled')
    })

    it('should allow hosts in allowedHosts', () => {
      const permission = createPermissionFromPreset('cmd', 'developer')
      const result = isNetworkAllowed(permission, 'registry.npmjs.org')
      expect(result.allowed).toBe(true)
    })

    it('should deny localhost when disabled', () => {
      const permission = createPermissionFromPreset('cmd', 'developer')
      const result = isNetworkAllowed(permission, 'localhost')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Localhost access is disabled')
    })

    it('should allow localhost when enabled', () => {
      const permission = createPermissionFromPreset('cmd', 'automation')
      const result = isNetworkAllowed(permission, 'localhost')
      expect(result.allowed).toBe(true)
    })

    it('should deny hosts in deniedHosts', () => {
      const permission = createPermissionFromPreset('cmd', 'apiClient')
      const result = isNetworkAllowed(permission, '169.254.169.254')
      expect(result.allowed).toBe(false)
    })

    it('should check ports when specified', () => {
      const permission = createCustomPermission('cmd', {
        network: {
          enabled: true,
          allowedHosts: ['*'],
          deniedHosts: [],
          allowedPorts: [80, 443],
          maxConnections: 10,
          timeout: 30000,
          allowLocalhost: false,
        },
      })

      expect(isNetworkAllowed(permission, 'example.com', 443).allowed).toBe(true)
      expect(isNetworkAllowed(permission, 'example.com', 8080).allowed).toBe(false)
    })

    it('should match wildcard host patterns', () => {
      const permission = createPermissionFromPreset('cmd', 'developer')
      const result = isNetworkAllowed(permission, 'raw.githubusercontent.com')
      expect(result.allowed).toBe(true)
    })
  })

  describe('checkExecutionLimits', () => {
    let permission: CommandPermission

    beforeEach(() => {
      permission = createPermissionFromPreset('cmd', 'readonly')
    })

    it('should allow within limits', () => {
      const result = checkExecutionLimits(permission, {
        duration: 1000,
        memory: 50 * 1024 * 1024,
      })
      expect(result.allowed).toBe(true)
    })

    it('should deny when duration exceeds limit', () => {
      const result = checkExecutionLimits(permission, {
        duration: 60000,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Duration')
    })

    it('should deny when memory exceeds limit', () => {
      const result = checkExecutionLimits(permission, {
        memory: 500 * 1024 * 1024,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Memory')
    })

    it('should deny when concurrent count at limit', () => {
      const result = checkExecutionLimits(permission, {
        concurrentCount: 1,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Concurrent')
    })

    it('should deny when rate limit reached', () => {
      const result = checkExecutionLimits(permission, {
        recentExecutions: 15,
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Rate limit')
    })
  })

  describe('checkPermission', () => {
    it('should check tool permission', () => {
      const permission = createPermissionFromPreset('cmd', 'readonly')
      const result = checkPermission(permission, { tool: 'write' })
      expect(result.allowed).toBe(false)
    })

    it('should check file permission', () => {
      const permission = createPermissionFromPreset('cmd', 'readonly')
      const result = checkPermission(permission, {
        filePath: `${process.cwd()}/file.ts`,
        fileOperation: 'write',
      })
      expect(result.allowed).toBe(false)
    })

    it('should check network permission', () => {
      const permission = createPermissionFromPreset('cmd', 'readonly')
      const result = checkPermission(permission, { host: 'example.com' })
      expect(result.allowed).toBe(false)
    })

    it('should check execution limits', () => {
      const permission = createPermissionFromPreset('cmd', 'restricted')
      const result = checkPermission(permission, {
        executionContext: { duration: 10000 },
      })
      expect(result.allowed).toBe(false)
    })

    it('should allow when all checks pass', () => {
      const permission = createPermissionFromPreset('cmd', 'developer')
      const result = checkPermission(permission, {
        tool: 'read',
        filePath: `${process.cwd()}/src/file.ts`,
        fileOperation: 'read',
      })
      expect(result.allowed).toBe(true)
    })

    it('should aggregate multiple violations', () => {
      const permission = createPermissionFromPreset('cmd', 'readonly')
      const result = checkPermission(permission, {
        tool: 'write',
        host: 'example.com',
      })
      expect(result.allowed).toBe(false)
      expect(result.violations.length).toBeGreaterThan(1)
    })
  })

  describe('Utility Functions', () => {
    describe('listPresets', () => {
      it('should list all preset names', () => {
        const presets = listPresets()
        expect(presets).toContain('readonly')
        expect(presets).toContain('editor')
        expect(presets).toContain('developer')
        expect(presets).toContain('apiClient')
        expect(presets).toContain('automation')
        expect(presets).toContain('restricted')
      })
    })

    describe('getPresetDetails', () => {
      it('should return preset details', () => {
        const details = getPresetDetails('developer')
        expect(details).toBeDefined()
        expect(details?.presetName).toBe('developer')
      })

      it('should return undefined for unknown preset', () => {
        const details = getPresetDetails('unknown')
        expect(details).toBeUndefined()
      })
    })
  })
})
