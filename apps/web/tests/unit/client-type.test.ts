/**
 * MCP Client Type Identification Tests
 *
 * Unit tests for client type resolution via waterfall strategy
 */

import { describe, it, expect } from 'vitest'
import {
  resolveClientType,
  resolveFromOAuthClientName,
  resolveFromClientInfo,
  resolveFromUserAgent,
  extractClientInfo,
} from '@/lib/security/client-type'

describe('Client Type Identification', () => {
  describe('resolveFromOAuthClientName', () => {
    it('should resolve "claude code" to claude_code', () => {
      expect(resolveFromOAuthClientName('claude code')).toBe('claude_code')
    })

    it('should resolve "claude-code" to claude_code', () => {
      expect(resolveFromOAuthClientName('claude-code')).toBe('claude_code')
    })

    it('should resolve "Claude Desktop" to claude_code (case-insensitive)', () => {
      expect(resolveFromOAuthClientName('Claude Desktop')).toBe('claude_code')
    })

    it('should resolve "opencode" to opencode', () => {
      expect(resolveFromOAuthClientName('opencode')).toBe('opencode')
    })

    it('should resolve "cursor" to cursor', () => {
      expect(resolveFromOAuthClientName('cursor')).toBe('cursor')
    })

    it('should resolve "codex" to codex', () => {
      expect(resolveFromOAuthClientName('codex')).toBe('codex')
    })

    it('should resolve "codex-mcp-client" to codex', () => {
      expect(resolveFromOAuthClientName('codex-mcp-client')).toBe('codex')
    })

    it('should resolve "mcporter" to openclaw', () => {
      expect(resolveFromOAuthClientName('mcporter')).toBe('openclaw')
    })

    it('should resolve "mcporter-openclaw" to openclaw', () => {
      expect(resolveFromOAuthClientName('mcporter-openclaw')).toBe('openclaw')
    })

    it('should resolve "OpenClaw mcporter" to openclaw (case-insensitive)', () => {
      expect(resolveFromOAuthClientName('OpenClaw mcporter')).toBe('openclaw')
    })

    it('should resolve "aitk cli" to cli', () => {
      expect(resolveFromOAuthClientName('aitk cli')).toBe('cli')
    })

    it('should resolve "aitk CLI" to cli (case-insensitive)', () => {
      expect(resolveFromOAuthClientName('aitk CLI')).toBe('cli')
    })

    it('should return undefined for unknown client name', () => {
      expect(resolveFromOAuthClientName('my-custom-app')).toBeUndefined()
    })

    it('should return undefined for undefined input', () => {
      expect(resolveFromOAuthClientName(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(resolveFromOAuthClientName('')).toBeUndefined()
    })

    it('should handle whitespace-padded names', () => {
      expect(resolveFromOAuthClientName('  claude code  ')).toBe('claude_code')
    })
  })

  describe('resolveFromClientInfo', () => {
    it('should resolve known MCP client names', () => {
      expect(resolveFromClientInfo({ name: 'claude code', version: '1.0.0' })).toBe('claude_code')
      expect(resolveFromClientInfo({ name: 'opencode', version: '0.5.0' })).toBe('opencode')
      expect(resolveFromClientInfo({ name: 'cursor', version: '2.0' })).toBe('cursor')
      expect(resolveFromClientInfo({ name: 'codex-mcp-client', version: '0.104.0' })).toBe('codex')
      expect(resolveFromClientInfo({ name: 'mcporter', version: '0.7.3' })).toBe('openclaw')
      expect(resolveFromClientInfo({ name: 'mcporter-openclaw' })).toBe('openclaw')
      expect(resolveFromClientInfo({ name: 'aitk CLI' })).toBe('cli')
    })

    it('should be case-insensitive', () => {
      expect(resolveFromClientInfo({ name: 'Claude Code' })).toBe('claude_code')
      expect(resolveFromClientInfo({ name: 'OPENCODE' })).toBe('opencode')
    })

    it('should return undefined for unknown client info', () => {
      expect(resolveFromClientInfo({ name: 'some-other-client' })).toBeUndefined()
    })

    it('should return undefined for undefined input', () => {
      expect(resolveFromClientInfo(undefined)).toBeUndefined()
    })

    it('should return undefined for empty name', () => {
      expect(resolveFromClientInfo({ name: '' })).toBeUndefined()
    })
  })

  describe('resolveFromUserAgent', () => {
    it('should detect Claude Code from User-Agent', () => {
      expect(resolveFromUserAgent('claude-code/1.0.0')).toBe('claude_code')
      expect(resolveFromUserAgent('ClaudeCode/2.0')).toBe('claude_code')
    })

    it('should detect Claude Desktop from User-Agent', () => {
      expect(resolveFromUserAgent('claude-desktop/1.0')).toBe('claude_code')
    })

    it('should detect OpenCode from User-Agent', () => {
      expect(resolveFromUserAgent('opencode/0.5.0')).toBe('opencode')
    })

    it('should detect Cursor from User-Agent', () => {
      expect(resolveFromUserAgent('cursor/1.0')).toBe('cursor')
    })

    it('should detect Codex from User-Agent', () => {
      expect(resolveFromUserAgent('codex/0.104.0')).toBe('codex')
    })

    it('should detect OpenClaw/mcporter from User-Agent', () => {
      expect(resolveFromUserAgent('mcporter/0.7.3')).toBe('openclaw')
      expect(resolveFromUserAgent('openclaw-client/1.0')).toBe('openclaw')
    })

    it('should detect web browsers', () => {
      expect(resolveFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe('web_browser')
      expect(resolveFromUserAgent('Chrome/120.0.0.0 Safari/537.36')).toBe('web_browser')
    })

    it('should detect CLI tools', () => {
      expect(resolveFromUserAgent('curl/7.88.1')).toBe('cli')
      expect(resolveFromUserAgent('HTTPie/3.2.1')).toBe('cli')
      expect(resolveFromUserAgent('Wget/1.21')).toBe('cli')
      expect(resolveFromUserAgent('PostmanRuntime/7.32.3')).toBe('cli')
    })

    it('should return undefined for unrecognized User-Agent', () => {
      expect(resolveFromUserAgent('totally-custom-client/1.0')).toBeUndefined()
    })

    it('should return undefined for undefined input', () => {
      expect(resolveFromUserAgent(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(resolveFromUserAgent('')).toBeUndefined()
    })
  })

  describe('extractClientInfo', () => {
    it('should extract clientInfo from initialize request', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'claude code',
            version: '1.0.23',
          },
        },
      }

      const result = extractClientInfo(body)
      expect(result).toEqual({ name: 'claude code', version: '1.0.23' })
    })

    it('should handle clientInfo without version', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'opencode',
          },
        },
      }

      const result = extractClientInfo(body)
      expect(result).toEqual({ name: 'opencode', version: undefined })
    })

    it('should return undefined for non-initialize methods', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }

      expect(extractClientInfo(body)).toBeUndefined()
    })

    it('should return undefined when params is missing', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      }

      expect(extractClientInfo(body)).toBeUndefined()
    })

    it('should return undefined when clientInfo is missing', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
        },
      }

      expect(extractClientInfo(body)).toBeUndefined()
    })

    it('should return undefined when clientInfo.name is not a string', () => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 123,
          },
        },
      }

      expect(extractClientInfo(body)).toBeUndefined()
    })

    it('should return undefined for null body', () => {
      expect(extractClientInfo(null)).toBeUndefined()
    })

    it('should return undefined for non-object body', () => {
      expect(extractClientInfo('string')).toBeUndefined()
    })
  })

  describe('resolveClientType (waterfall)', () => {
    it('should prioritize OAuth client name over other signals', () => {
      const result = resolveClientType({
        oauthClientName: 'claude code',
        clientInfo: { name: 'opencode', version: '1.0' },
        userAgent: 'cursor/1.0',
      })
      expect(result).toBe('claude_code')
    })

    it('should fallback to clientInfo when OAuth name is unknown', () => {
      const result = resolveClientType({
        oauthClientName: 'unknown-app',
        clientInfo: { name: 'opencode', version: '1.0' },
        userAgent: 'cursor/1.0',
      })
      expect(result).toBe('opencode')
    })

    it('should fallback to User-Agent when other signals are absent', () => {
      const result = resolveClientType({
        userAgent: 'cursor/1.0',
      })
      expect(result).toBe('cursor')
    })

    it('should return unknown when no signals match', () => {
      const result = resolveClientType({})
      expect(result).toBe('unknown')
    })

    it('should return unknown when all signals are undefined', () => {
      const result = resolveClientType({
        oauthClientName: undefined,
        clientInfo: undefined,
        userAgent: undefined,
      })
      expect(result).toBe('unknown')
    })

    it('should fallback to User-Agent when clientInfo name is unrecognized', () => {
      const result = resolveClientType({
        oauthClientName: 'custom-app',
        clientInfo: { name: 'custom-mcp-client' },
        userAgent: 'Mozilla/5.0 Chrome/120',
      })
      expect(result).toBe('web_browser')
    })

    it('should use OAuth name even with missing clientInfo and userAgent', () => {
      const result = resolveClientType({
        oauthClientName: 'cursor',
      })
      expect(result).toBe('cursor')
    })
  })
})
