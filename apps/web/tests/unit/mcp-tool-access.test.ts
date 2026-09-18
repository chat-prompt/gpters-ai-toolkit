import { describe, expect, it } from 'vitest'
import { canCallMcpRestAction, canCallMcpTool } from '../../../../packages/lib/src/mcp/tool-access'

describe('scoped MCP access', () => {
  it('keeps AX closed to legacy tokens', () => {
    expect(canCallMcpTool('semantic_search')).toBe(true)
    expect(canCallMcpTool('deploy_skill')).toBe(true)
    expect(canCallMcpTool('ax_get_panel')).toBe(false)
  })

  it('limits a catalog and AX read token to reading', () => {
    const scope = 'toolkit:read ax:read'
    for (const name of ['semantic_search', 'get_plugin_content', 'ax_list_panels', 'ax_get_panel']) {
      expect(canCallMcpTool(name, scope)).toBe(true)
    }
    for (const name of ['deploy_skill', 'undeploy_skill', 'report_usage', 'add_files']) {
      expect(canCallMcpTool(name, scope)).toBe(false)
    }
    expect(canCallMcpRestAction('search', scope)).toBe(true)
    expect(canCallMcpRestAction('deploy', scope)).toBe(false)
    expect(canCallMcpRestAction('tools', scope)).toBe(false)
  })

  it('does not grant catalog access to AX-only tokens', () => {
    expect(canCallMcpTool('ax_get_panel', 'ax:read')).toBe(true)
    expect(canCallMcpTool('get_plugin_content', 'ax:read')).toBe(false)
    expect(canCallMcpRestAction('get', 'ax:read')).toBe(false)
  })

  it('does not reinterpret existing OAuth scopes', () => {
    expect(canCallMcpTool('deploy_skill', 'mcp:read')).toBe(true)
    expect(canCallMcpTool('ax_get_panel', 'mcp:read')).toBe(false)
  })
})
