import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../..')

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

describe('single GPTers catalog policy', () => {
  it('does not filter catalog reads by legacy visibility metadata', () => {
    const readPaths = [
      'packages/lib/src/core/catalog.ts',
      'packages/lib/src/search/vector-search.ts',
      'packages/lib/src/search/full-text-search.ts',
      'packages/lib/src/features/ax/skills.ts',
      'apps/web/app/api/stats/route.ts',
    ]

    for (const path of readPaths) {
      const contents = source(path)
      expect(contents, path).not.toContain('eq(catalogItems.visibility')
      expect(contents, path).not.toContain('buildVisibilityFilter')
    }
  })

  it('does not expose organization or visibility controls in catalog admin pages', () => {
    const adminPaths = [
      'apps/web/app/[locale]/admin/catalog/new/page.tsx',
      'apps/web/app/[locale]/admin/catalog/[id]/edit/page.tsx',
      'apps/web/app/[locale]/admin/catalog/page.tsx',
    ]

    for (const path of adminPaths) {
      const contents = source(path)
      expect(contents, path).not.toContain('Visibility')
      expect(contents, path).not.toContain('Organization')
    }
  })

  it('does not advertise visibility controls in CLI or MCP', () => {
    const cli = source('apps/aitk-cli/bin/aitk.ts')
    const mcpTools = source('packages/lib/src/mcp/tools.ts')

    expect(cli).not.toContain('--visibility')
    expect(mcpTools).not.toContain('visibility: {')
  })
})
