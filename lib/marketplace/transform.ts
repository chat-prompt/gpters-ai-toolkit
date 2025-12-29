/**
 * Transform CatalogItem to Claude Code Plugin format
 */

import type { CatalogItem } from '../core/types'
import type {
  MarketplaceJson,
  PluginEntry,
  PluginJson,
  PluginStructure,
  HookConfig,
  HookMatcherConfig,
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
 * Transform CatalogItem to hook JSON configuration
 * This generates the settings.json hook configuration for users to copy
 */
export function transformToHookJson(item: CatalogItem): string {
  if (!item.hookEvent || !item.hookCommand) {
    throw new Error('Hook must have event and command defined')
  }

  const hookConfig: HookConfig = {
    type: 'command',
    command: item.hookCommand,
  }

  if (item.hookTimeout) {
    hookConfig.timeout = item.hookTimeout
  }

  if (item.hookBlocking !== undefined) {
    hookConfig.blocking = item.hookBlocking
  }

  const matcherConfig: HookMatcherConfig = {
    hooks: [hookConfig],
  }

  if (item.hookMatcher) {
    matcherConfig.matcher = item.hookMatcher
  }

  const eventConfig = {
    [item.hookEvent]: [matcherConfig],
  }

  return JSON.stringify(eventConfig, null, 2)
}

/**
 * Generate complete hook settings for copy-paste installation
 */
export function generateHookSettingsSnippet(item: CatalogItem): string {
  if (!item.hookEvent || !item.hookCommand) {
    throw new Error('Hook must have event and command defined')
  }

  const hookObj: Record<string, unknown> = {
    type: 'command',
    command: item.hookCommand,
  }

  if (item.hookTimeout) {
    hookObj.timeout = item.hookTimeout
  }

  if (item.hookBlocking !== undefined) {
    hookObj.blocking = item.hookBlocking
  }

  const matcherObj: Record<string, unknown> = {
    hooks: [hookObj],
  }

  if (item.hookMatcher) {
    matcherObj.matcher = item.hookMatcher
  }

  return `{
  "hooks": {
    "${item.hookEvent}": [
${JSON.stringify(matcherObj, null, 6).split('\n').map(line => '      ' + line).join('\n').slice(6)}
    ]
  }
}`
}

/**
 * Generate skill description with trigger keywords for discovery
 */
function generateSkillDescription(item: CatalogItem): string {
  // Include common trigger phrases for better skill discovery
  const triggers: string[] = []

  if (item.type === 'skill') {
    triggers.push(`Use when asked to "${item.name.toLowerCase()}"`)
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
  let contentType: 'skill' | 'agent' | 'command' | 'hook'
  let contentPath: string

  switch (item.type) {
    case 'skill':
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

    case 'hook':
      content = transformToHookJson(item)
      contentType = 'hook'
      contentPath = `hooks/${item.id}.json`
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
    guide: 'Guide',
    hook: 'Hook',
    package: 'Package',
  }[item.type]

  // Hook has different installation method
  if (item.type === 'hook') {
    return `# ${item.name}

${item.description}

## Type
${typeLabel}

## Event
\`${item.hookEvent}\`${item.hookMatcher ? ` (matcher: \`${item.hookMatcher}\`)` : ''}

## Author
${item.author}

## Tags
${item.tags?.map((t) => `\`${t}\``).join(', ') || 'None'}

## Installation

Add the following to your \`~/.claude/settings.json\` or \`.claude/settings.local.json\`:

\`\`\`json
${generateHookSettingsSnippet(item)}
\`\`\`

---

*Part of [GPTers AI Toolkit](https://github.com/chat-prompt/gpters-ai-toolkit)*
`
  }

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
