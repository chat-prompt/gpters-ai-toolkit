/**
 * Transform CatalogItem to Claude Code Plugin format
 */

import type { CatalogItem } from '../types'
import type {
  MarketplaceJson,
  PluginEntry,
  PluginJson,
  PluginStructure,
  SkillFrontmatter,
} from './types'
import { MARKETPLACE_CONFIG } from './types'

/**
 * Generate marketplace.json from catalog items
 */
export function generateMarketplaceJson(items: CatalogItem[]): MarketplaceJson {
  const plugins: PluginEntry[] = items
    .filter((item) => item.type !== 'guide') // guides are web-only
    .filter((item) => item.marketplaceEnabled)
    .map((item) => ({
      name: item.id,
      source: `./plugins/${item.id}`,
      description: item.description,
      version: item.marketplaceVersion || '1.0.0',
      author: { name: item.author },
      category: item.type,
      keywords: item.tags || [],
    }))

  return {
    name: MARKETPLACE_CONFIG.name,
    owner: MARKETPLACE_CONFIG.owner,
    metadata: MARKETPLACE_CONFIG.metadata,
    plugins,
  }
}

/**
 * Generate plugin.json for a single plugin
 */
export function generatePluginJson(item: CatalogItem): PluginJson {
  return {
    name: item.id,
    version: item.marketplaceVersion || '1.0.0',
    description: item.description,
    author: { name: item.author },
    keywords: item.tags || [],
  }
}

/**
 * Transform CatalogItem to SKILL.md content with YAML frontmatter
 */
export function transformToSkillMd(item: CatalogItem): string {
  const lines = [
    '---',
    `name: ${item.name}`,
    `description: ${generateSkillDescription(item)}`,
  ]

  // Add allowed-tools if specified
  if (item.allowedTools) {
    lines.push(`allowed-tools: ${item.allowedTools}`)
  }

  lines.push('---', '')

  return lines.join('\n') + item.content
}

/**
 * Transform CatalogItem to agent markdown
 */
export function transformToAgentMd(item: CatalogItem): string {
  const lines = [
    '---',
    `name: ${item.id}`,
    `description: ${item.description}`,
  ]

  // Add agent-specific fields
  if (item.allowedTools) {
    lines.push(`tools: ${item.allowedTools}`)
  }
  if (item.agentModel) {
    lines.push(`model: ${item.agentModel}`)
  }
  if (item.agentPermissionMode) {
    lines.push(`permissionMode: ${item.agentPermissionMode}`)
  }
  if (item.agentSkills) {
    lines.push(`skills: ${item.agentSkills}`)
  }

  lines.push('---', '')

  return lines.join('\n') + item.content
}

/**
 * Transform CatalogItem to command markdown
 */
export function transformToCommandMd(item: CatalogItem): string {
  const lines = [
    '---',
    `description: ${item.description}`,
  ]

  // Add command-specific fields
  if (item.allowedTools) {
    lines.push(`allowed-tools: ${item.allowedTools}`)
  }
  if (item.commandArgumentHint) {
    lines.push(`argument-hint: ${item.commandArgumentHint}`)
  }
  if (item.commandDisableModelInvocation) {
    lines.push(`disable-model-invocation: true`)
  }

  lines.push('---', '')

  return lines.join('\n') + item.content
}

/**
 * Generate skill description with trigger keywords for discovery
 */
function generateSkillDescription(item: CatalogItem): string {
  // Include common trigger phrases for better skill discovery
  const triggers: string[] = []

  if (item.type === 'skill') {
    triggers.push(`Use when asked to "${item.name.toLowerCase()}"`)
  } else if (item.type === 'prompt') {
    triggers.push(`Use this prompt when asked about "${item.name.toLowerCase()}"`)
  }

  // Add tag-based triggers
  if (item.tags?.includes('code')) {
    triggers.push('code review', 'analyze code')
  }
  if (item.tags?.includes('git')) {
    triggers.push('git commit', 'version control')
  }
  if (item.tags?.includes('documentation')) {
    triggers.push('write documentation', 'create docs')
  }

  const triggerText = triggers.length > 0 ? ` Triggers: ${triggers.join(', ')}.` : ''

  return `${item.description}${triggerText}`
}

/**
 * Generate complete plugin structure for a CatalogItem
 */
export function generatePluginStructure(item: CatalogItem): PluginStructure {
  const pluginJson = generatePluginJson(item)

  let content: string
  let contentType: 'skill' | 'agent' | 'command'
  let contentPath: string

  switch (item.type) {
    case 'skill':
    case 'prompt': // prompts are converted to skills
      content = transformToSkillMd(item)
      contentType = 'skill'
      contentPath = `skills/${item.id}/SKILL.md`
      break

    case 'agent':
      content = transformToAgentMd(item)
      contentType = 'agent'
      contentPath = `agents/${item.id}.md`
      break

    case 'command':
      content = transformToCommandMd(item)
      contentType = 'command'
      contentPath = `commands/${item.id}.md`
      break

    default:
      throw new Error(`Unsupported item type for marketplace: ${item.type}`)
  }

  return {
    pluginJson,
    contentPath,
    contentType,
    content,
    readme: item.readme,
  }
}

/**
 * Generate file paths and contents for a plugin
 */
export function generatePluginFiles(
  item: CatalogItem
): Array<{ path: string; content: string }> {
  const structure = generatePluginStructure(item)
  const basePath = `plugins/${item.id}`

  const files: Array<{ path: string; content: string }> = [
    {
      path: `${basePath}/.claude-plugin/plugin.json`,
      content: JSON.stringify(structure.pluginJson, null, 2),
    },
    {
      path: `${basePath}/${structure.contentPath}`,
      content: structure.content,
    },
  ]

  // Add README if available
  if (structure.readme) {
    files.push({
      path: `${basePath}/README.md`,
      content: structure.readme,
    })
  } else {
    // Generate default README
    files.push({
      path: `${basePath}/README.md`,
      content: generateDefaultReadme(item),
    })
  }

  return files
}

/**
 * Generate default README for a plugin
 */
function generateDefaultReadme(item: CatalogItem): string {
  const typeLabel = {
    skill: 'Skill',
    agent: 'Agent',
    command: 'Command',
    prompt: 'Prompt',
    guide: 'Guide',
  }[item.type]

  return `# ${item.name}

${item.description}

## Type
${typeLabel}

## Author
${item.author}

## Tags
${item.tags?.map((t) => `\`${t}\``).join(', ') || 'None'}

## Installation

\`\`\`bash
/plugin marketplace add chat-prompt/gpters-ai-toolkit
/plugin install ${item.id}@gpters-ai-toolkit
\`\`\`

---

*Part of [GPTers AI Toolkit](https://github.com/chat-prompt/gpters-ai-toolkit)*
`
}
