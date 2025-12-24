/**
 * Claude Code Marketplace Types
 * https://code.claude.com/docs/en/plugin-marketplaces
 */

export interface MarketplaceOwner {
  name: string
  email?: string
}

export interface MarketplaceMetadata {
  description: string
  version?: string
  pluginRoot?: string
}

export interface PluginAuthor {
  name: string
  email?: string
  url?: string
}

export interface PluginEntry {
  name: string
  source: string
  description?: string
  version?: string
  author?: PluginAuthor
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  category?: string
  tags?: string[]
}

export interface MarketplaceJson {
  name: string
  owner: MarketplaceOwner
  metadata?: MarketplaceMetadata
  plugins: PluginEntry[]
}

export interface PluginJson {
  name: string
  version: string
  description: string
  author?: PluginAuthor
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
}

export interface SkillFrontmatter {
  name: string
  description: string
  version?: string
}

export interface SyncResult {
  success: boolean
  filesCreated: string[]
  filesUpdated: string[]
  filesDeleted: string[]
  errors: string[]
  syncedAt: Date
}

export interface PluginStructure {
  pluginJson: PluginJson
  contentPath: string
  contentType: 'skill' | 'agent' | 'command'
  content: string
  readme?: string
}

// Marketplace configuration
export const MARKETPLACE_CONFIG = {
  name: 'gpters-ai-toolkit',
  owner: {
    name: 'GPTers',
    email: 'contact@gpters.org',
  },
  metadata: {
    description: 'GPTers AI Toolkit - Claude Code Skills, Agents, and Commands',
    pluginRoot: './plugins',
  },
  repository: {
    owner: process.env.GH_OWNER || 'gpters',
    repo: process.env.GH_REPO || 'gpters-ai-toolkit',
    branch: process.env.GH_BRANCH || 'main',
    path: process.env.GH_MARKETPLACE_PATH || 'marketplace',
  },
} as const
