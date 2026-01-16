/**
 * Frontmatter parsing utilities
 *
 * Parses YAML frontmatter from markdown content and generates
 * slugified IDs from item names for catalog items.
 */
import type { ItemType, Difficulty } from '../core/types'

export interface ParsedFrontmatter {
  id?: string
  type?: ItemType
  name?: string
  description?: string
  author?: string
  tags?: string[]
  difficulty?: Difficulty
  pluginId?: string
  estimatedTime?: string
  dependencies?: string[]
}

export interface ParsedMarkdown {
  frontmatter: ParsedFrontmatter
  content: string
}

/**
 * Parse frontmatter from markdown content
 * Supports YAML-style frontmatter between --- delimiters
 */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/
  const match = markdown.match(frontmatterRegex)

  if (!match) {
    return {
      frontmatter: {},
      content: markdown.trim(),
    }
  }

  const frontmatterBlock = match[1]
  const content = markdown.slice(match[0].length).trim()
  const frontmatter: ParsedFrontmatter = {}

  const lines = frontmatterBlock.split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    // Handle array syntax: [item1, item2] or item1, item2
    if (key === 'tags' || key === 'dependencies') {
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1)
      }
      const items = value
        .split(',')
        .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      if (key === 'tags') {
        frontmatter.tags = items
      } else {
        frontmatter.dependencies = items
      }
      continue
    }

    // Remove quotes if present
    value = value.replace(/^['"]|['"]$/g, '')

    switch (key) {
      case 'id':
        frontmatter.id = value
        break
      case 'type':
        if (['skill', 'agent', 'command', 'guide'].includes(value)) {
          frontmatter.type = value as ItemType
        }
        break
      case 'name':
        frontmatter.name = value
        break
      case 'description':
        frontmatter.description = value
        break
      case 'author':
        frontmatter.author = value
        break
      case 'difficulty':
        if (['easy', 'medium', 'hard'].includes(value)) {
          frontmatter.difficulty = value as Difficulty
        }
        break
      case 'pluginId':
        frontmatter.pluginId = value
        break
      case 'estimatedTime':
        frontmatter.estimatedTime = value
        break
    }
  }

  return { frontmatter, content }
}

/**
 * Generate ID from name (kebab-case)
 */
export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
