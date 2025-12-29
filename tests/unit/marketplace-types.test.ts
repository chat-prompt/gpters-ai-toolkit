import { describe, it, expect } from 'vitest'
import {
  MARKETPLACE_CONFIG,
  type MarketplaceJson,
  type PluginEntry,
  type PluginJson,
  type SyncResult,
  type HookConfig,
  type HookMatcherConfig,
} from '@/lib/marketplace/types'

describe('Marketplace Types', () => {
  describe('MARKETPLACE_CONFIG', () => {
    it('should have correct name', () => {
      expect(MARKETPLACE_CONFIG.name).toBe('gpters-ai-toolkit')
    })

    it('should have owner information', () => {
      expect(MARKETPLACE_CONFIG.owner).toBeDefined()
      expect(MARKETPLACE_CONFIG.owner.name).toBe('GPTers')
      expect(MARKETPLACE_CONFIG.owner.email).toBe('contact@gpters.org')
    })

    it('should have metadata', () => {
      expect(MARKETPLACE_CONFIG.metadata).toBeDefined()
      expect(MARKETPLACE_CONFIG.metadata.description).toContain('GPTers AI Toolkit')
      expect(MARKETPLACE_CONFIG.metadata.pluginRoot).toBe('./plugins')
    })

    it('should have repository configuration', () => {
      expect(MARKETPLACE_CONFIG.repository).toBeDefined()
      expect(MARKETPLACE_CONFIG.repository.owner).toBeDefined()
      expect(MARKETPLACE_CONFIG.repository.repo).toBeDefined()
      expect(MARKETPLACE_CONFIG.repository.branch).toBeDefined()
    })

    it('should use environment variables for repository if set', () => {
      // Default values should be provided
      expect(typeof MARKETPLACE_CONFIG.repository.owner).toBe('string')
      expect(typeof MARKETPLACE_CONFIG.repository.repo).toBe('string')
      expect(typeof MARKETPLACE_CONFIG.repository.branch).toBe('string')
    })
  })

  describe('Type Validation', () => {
    describe('MarketplaceJson', () => {
      it('should validate marketplace json structure', () => {
        const validMarketplace: MarketplaceJson = {
          name: 'test-marketplace',
          owner: { name: 'Test Owner' },
          plugins: [],
        }

        expect(validMarketplace.name).toBe('test-marketplace')
        expect(validMarketplace.owner.name).toBe('Test Owner')
        expect(validMarketplace.plugins).toEqual([])
      })

      it('should accept optional metadata', () => {
        const marketplace: MarketplaceJson = {
          name: 'test',
          owner: { name: 'Owner' },
          metadata: {
            description: 'Test description',
            version: '1.0.0',
          },
          plugins: [],
        }

        expect(marketplace.metadata?.description).toBe('Test description')
        expect(marketplace.metadata?.version).toBe('1.0.0')
      })
    })

    describe('PluginEntry', () => {
      it('should validate plugin entry structure', () => {
        const entry: PluginEntry = {
          name: 'test-plugin',
          source: './plugins/test-plugin',
          description: 'A test plugin',
          version: '1.0.0',
          author: { name: 'Test Author' },
          category: 'skill',
          keywords: ['test', 'example'],
        }

        expect(entry.name).toBe('test-plugin')
        expect(entry.source).toBe('./plugins/test-plugin')
        expect(entry.keywords).toContain('test')
      })

      it('should accept minimal plugin entry', () => {
        const minimal: PluginEntry = {
          name: 'minimal',
          source: './plugins/minimal',
        }

        expect(minimal.name).toBe('minimal')
        expect(minimal.description).toBeUndefined()
      })
    })

    describe('PluginJson', () => {
      it('should validate plugin json structure', () => {
        const plugin: PluginJson = {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test plugin description',
          author: { name: 'Author' },
          keywords: ['keyword1'],
        }

        expect(plugin.name).toBe('test-plugin')
        expect(plugin.version).toBe('1.0.0')
        expect(plugin.description).toBe('Test plugin description')
      })
    })

    describe('SyncResult', () => {
      it('should validate sync result structure', () => {
        const result: SyncResult = {
          success: true,
          filesCreated: ['file1.md', 'file2.json'],
          filesUpdated: ['file3.md'],
          filesDeleted: [],
          errors: [],
          syncedAt: new Date(),
        }

        expect(result.success).toBe(true)
        expect(result.filesCreated).toHaveLength(2)
        expect(result.filesUpdated).toHaveLength(1)
        expect(result.errors).toHaveLength(0)
        expect(result.syncedAt).toBeInstanceOf(Date)
      })

      it('should handle failed sync result', () => {
        const result: SyncResult = {
          success: false,
          filesCreated: [],
          filesUpdated: [],
          filesDeleted: [],
          errors: ['Connection failed', 'Rate limit exceeded'],
          syncedAt: new Date(),
        }

        expect(result.success).toBe(false)
        expect(result.errors).toHaveLength(2)
      })
    })

    describe('HookConfig', () => {
      it('should validate hook config structure', () => {
        const hook: HookConfig = {
          type: 'command',
          command: 'echo "test"',
          timeout: 5000,
          blocking: true,
        }

        expect(hook.type).toBe('command')
        expect(hook.command).toBe('echo "test"')
        expect(hook.timeout).toBe(5000)
        expect(hook.blocking).toBe(true)
      })

      it('should accept minimal hook config', () => {
        const hook: HookConfig = {
          type: 'command',
          command: 'test-command',
        }

        expect(hook.timeout).toBeUndefined()
        expect(hook.blocking).toBeUndefined()
      })
    })

    describe('HookMatcherConfig', () => {
      it('should validate hook matcher config', () => {
        const config: HookMatcherConfig = {
          matcher: '*.ts',
          hooks: [
            { type: 'command', command: 'lint' },
            { type: 'command', command: 'test' },
          ],
        }

        expect(config.matcher).toBe('*.ts')
        expect(config.hooks).toHaveLength(2)
      })

      it('should accept config without matcher', () => {
        const config: HookMatcherConfig = {
          hooks: [{ type: 'command', command: 'run' }],
        }

        expect(config.matcher).toBeUndefined()
        expect(config.hooks).toHaveLength(1)
      })
    })
  })
})
