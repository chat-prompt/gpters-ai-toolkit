/** New opt-in OAuth scopes for read-only MCP clients. Existing token scopes retain their behavior. */
const CATALOG_READ_TOOLS = new Set([
  'semantic_search',
  'get_plugin_content',
  'check_updates',
  'search_plugins',
  'list_plugins',
  'get_plugins_by_category',
])
const AX_READ_TOOLS = new Set(['ax_list_panels', 'ax_get_panel'])

function scopes(scope?: string): Set<string> {
  return new Set(scope?.split(/\s+/).filter(Boolean) ?? [])
}

export function canCallMcpTool(name: string, scope?: string): boolean {
  const granted = scopes(scope)
  const catalogRead = granted.has('toolkit:read')
  const axRead = granted.has('ax:read')
  if (catalogRead || axRead) {
    return (catalogRead && CATALOG_READ_TOOLS.has(name)) || (axRead && AX_READ_TOOLS.has(name))
  }
  // AX data is never available through an unscoped legacy token.
  return !AX_READ_TOOLS.has(name)
}

export function canCallMcpRestAction(action: string, scope?: string): boolean {
  const granted = scopes(scope)
  const catalogRead = granted.has('toolkit:read')
  if (!catalogRead && !granted.has('ax:read')) return true
  return catalogRead && ['search', 'get', 'list', 'whoami'].includes(action)
}
