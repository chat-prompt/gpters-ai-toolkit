import fs from 'fs'
import path from 'path'
import { CatalogItem, ItemType, Difficulty } from './types'

const ROOT_DIR = process.cwd()

interface FrontMatter {
  name?: string
  description?: string
  author?: string
  tags?: string[]
  difficulty?: Difficulty
  pluginId?: string
}

function parseFrontMatter(content: string): { frontMatter: FrontMatter; body: string } {
  const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontMatterRegex)

  if (!match) {
    return { frontMatter: {}, body: content }
  }

  const frontMatterStr = match[1]
  const body = match[2]

  const frontMatter: FrontMatter = {}

  frontMatterStr.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) return

    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (key === 'name') frontMatter.name = value
    if (key === 'description') frontMatter.description = value
    if (key === 'author') frontMatter.author = value
    if (key === 'difficulty') frontMatter.difficulty = value as Difficulty
    if (key === 'pluginId') frontMatter.pluginId = value
    if (key === 'tags') {
      // Parse tags array: [tag1, tag2] or tag1, tag2
      const tagsMatch = value.match(/\[(.*)\]/)
      if (tagsMatch) {
        frontMatter.tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''))
      }
    }
  })

  return { frontMatter, body }
}

function scanDirectory(type: ItemType): CatalogItem[] {
  const dirMap: Record<ItemType, string> = {
    skill: 'skills',
    agent: 'agents',
    prompt: 'prompts',
  }

  const dirPath = path.join(ROOT_DIR, dirMap[type])

  if (!fs.existsSync(dirPath)) {
    return []
  }

  const items: CatalogItem[] = []

  if (type === 'prompt') {
    // Prompts are single files
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && !f.startsWith('_'))

    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const { frontMatter, body } = parseFrontMatter(content)
      const id = file.replace('.md', '')

      items.push({
        id,
        type,
        name: frontMatter.name || id,
        description: frontMatter.description || '',
        author: frontMatter.author || 'unknown',
        tags: frontMatter.tags || [],
        content: body,
      })
    }
  } else {
    // Skills and agents are directories
    const dirs = fs.readdirSync(dirPath).filter(d => {
      const stat = fs.statSync(path.join(dirPath, d))
      return stat.isDirectory() && !d.startsWith('_')
    })

    for (const dir of dirs) {
      const mainFile = type === 'skill' ? 'skill.md' : 'agent.md'
      const mainFilePath = path.join(dirPath, dir, mainFile)
      const readmePath = path.join(dirPath, dir, 'README.md')

      if (!fs.existsSync(mainFilePath)) continue

      const content = fs.readFileSync(mainFilePath, 'utf-8')
      const { frontMatter, body } = parseFrontMatter(content)

      let readme: string | undefined
      if (fs.existsSync(readmePath)) {
        readme = fs.readFileSync(readmePath, 'utf-8')
      }

      // Get file stats for dates
      const stats = fs.statSync(mainFilePath)

      items.push({
        id: dir,
        type,
        name: frontMatter.name || dir,
        description: frontMatter.description || '',
        author: frontMatter.author || 'unknown',
        tags: frontMatter.tags || [],
        difficulty: frontMatter.difficulty,
        pluginId: frontMatter.pluginId,
        content: body,
        readme,
        createdAt: stats.birthtime.toISOString().split('T')[0],
        updatedAt: stats.mtime.toISOString().split('T')[0],
      })
    }
  }

  return items
}

export function getCatalog(): CatalogItem[] {
  const skills = scanDirectory('skill')
  const agents = scanDirectory('agent')
  const prompts = scanDirectory('prompt')

  return [...skills, ...agents, ...prompts]
}

export function getItemById(id: string): CatalogItem | undefined {
  const catalog = getCatalog()
  return catalog.find(item => item.id === id)
}

export function getItemsByType(type: ItemType): CatalogItem[] {
  const catalog = getCatalog()
  return catalog.filter(item => item.type === type)
}
