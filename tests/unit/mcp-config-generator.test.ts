import { describe, it, expect } from 'vitest'

/**
 * Tests for MCP Config Generator logic
 * These test the JSON generation logic that the component uses
 */

interface MCPConfig {
  mcpServers: {
    'gpters-ai-toolkit': {
      type: string
      url: string
    }
  }
}

function generateMCPConfig(url: string): MCPConfig {
  const serverUrl = url.trim() || 'https://your-url/api/mcp'
  return {
    mcpServers: {
      'gpters-ai-toolkit': {
        type: 'http',
        url: serverUrl,
      },
    },
  }
}

describe('MCP Config Generator', () => {
  describe('generateMCPConfig', () => {
    it('generates correct config structure with valid URL', () => {
      const url = 'https://example.com/api/mcp'
      const config = generateMCPConfig(url)

      expect(config).toEqual({
        mcpServers: {
          'gpters-ai-toolkit': {
            type: 'http',
            url: 'https://example.com/api/mcp',
          },
        },
      })
    })

    it('uses placeholder URL when input is empty', () => {
      const config = generateMCPConfig('')

      expect(config).toEqual({
        mcpServers: {
          'gpters-ai-toolkit': {
            type: 'http',
            url: 'https://your-url/api/mcp',
          },
        },
      })
    })

    it('trims whitespace from URL', () => {
      const config = generateMCPConfig('  https://example.com/api/mcp  ')

      expect(config).toEqual({
        mcpServers: {
          'gpters-ai-toolkit': {
            type: 'http',
            url: 'https://example.com/api/mcp',
          },
        },
      })
    })

    it('uses placeholder for whitespace-only input', () => {
      const config = generateMCPConfig('   ')

      expect(config).toEqual({
        mcpServers: {
          'gpters-ai-toolkit': {
            type: 'http',
            url: 'https://your-url/api/mcp',
          },
        },
      })
    })

    it('generates valid JSON output', () => {
      const url = 'https://gpters.org/api/mcp'
      const config = generateMCPConfig(url)
      const jsonString = JSON.stringify(config, null, 2)

      // Should be valid JSON
      expect(() => JSON.parse(jsonString)).not.toThrow()

      // Check JSON structure
      const parsed = JSON.parse(jsonString)
      expect(parsed.mcpServers).toBeDefined()
      expect(parsed.mcpServers['gpters-ai-toolkit']).toBeDefined()
      expect(parsed.mcpServers['gpters-ai-toolkit'].type).toBe('http')
      expect(parsed.mcpServers['gpters-ai-toolkit'].url).toBe(url)
    })

    it('preserves URL exactly as provided (no modifications)', () => {
      const url = 'https://custom-domain.com:8080/custom/path/mcp'
      const config = generateMCPConfig(url)

      expect(config.mcpServers['gpters-ai-toolkit'].url).toBe(url)
    })
  })

  describe('JSON output format', () => {
    it('produces properly formatted JSON with 2-space indentation', () => {
      const url = 'https://test.com/api/mcp'
      const config = generateMCPConfig(url)
      const jsonString = JSON.stringify(config, null, 2)

      // Check that indentation is correct (2 spaces)
      expect(jsonString).toContain('  "mcpServers"')
      expect(jsonString).toContain('    "gpters-ai-toolkit"')
    })

    it('matches expected output format from requirements', () => {
      const url = 'https://your-url/api/mcp'
      const config = generateMCPConfig(url)
      const jsonString = JSON.stringify(config, null, 2)

      const expectedFormat = `{
  "mcpServers": {
    "gpters-ai-toolkit": {
      "type": "http",
      "url": "https://your-url/api/mcp"
    }
  }
}`

      expect(jsonString).toBe(expectedFormat)
    })
  })
})
