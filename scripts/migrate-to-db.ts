import fs from 'fs'
import path from 'path'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { catalogItems } from '../lib/db/schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql)

type ItemType = 'skill' | 'agent' | 'command' | 'guide'
type Difficulty = 'easy' | 'medium' | 'hard'

interface MigrationItem {
  id: string
  type: ItemType
  name: string
  description: string
  author: string
  tags: string[]
  difficulty: Difficulty | null
  pluginId: string | null
  estimatedTime: string | null
  content: string
  readme: string | null
}

interface FrontMatter {
  name?: string
  description?: string
  author?: string
  tags?: string[]
  difficulty?: Difficulty
  pluginId?: string
  estimatedTime?: string
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
    if (key === 'estimatedTime') frontMatter.estimatedTime = value
    if (key === 'tags') {
      const tagsMatch = value.match(/\[(.*)\]/)
      if (tagsMatch) {
        frontMatter.tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''))
      }
    }
  })

  return { frontMatter, body }
}

async function migrateDirectory(type: ItemType): Promise<number> {
  const ROOT_DIR = path.resolve(process.cwd(), '..')

  const dirMap: Record<ItemType, string> = {
    skill: 'skills',
    agent: 'agents',
    command: 'commands',
    guide: 'guides',
  }

  const mainFileMap: Record<ItemType, string> = {
    skill: 'skill.md',
    agent: 'agent.md',
    command: 'command.md',
    guide: 'guide.md',
  }

  const dirPath = path.join(ROOT_DIR, dirMap[type])

  if (!fs.existsSync(dirPath)) {
    console.log(`  Directory not found: ${dirPath}`)
    return 0
  }

  const items: MigrationItem[] = []

  // All types are directories with a main file
  const dirs = fs.readdirSync(dirPath).filter(d => {
      const stat = fs.statSync(path.join(dirPath, d))
      return stat.isDirectory() && !d.startsWith('_')
    })

    for (const dir of dirs) {
      const mainFile = mainFileMap[type]
      const mainFilePath = path.join(dirPath, dir, mainFile)
      const readmePath = path.join(dirPath, dir, 'README.md')

      if (!fs.existsSync(mainFilePath)) {
        console.log(`  Skipping ${dir}: ${mainFile} not found`)
        continue
      }

      const content = fs.readFileSync(mainFilePath, 'utf-8')
      const { frontMatter, body } = parseFrontMatter(content)

      let readme: string | null = null
      if (fs.existsSync(readmePath)) {
        readme = fs.readFileSync(readmePath, 'utf-8')
      }

      items.push({
        id: dir,
        type,
        name: frontMatter.name || dir,
        description: frontMatter.description || '',
        author: frontMatter.author || 'unknown',
        tags: frontMatter.tags || [],
        difficulty: frontMatter.difficulty || null,
        pluginId: frontMatter.pluginId || null,
        estimatedTime: frontMatter.estimatedTime || null,
        content: body,
        readme,
      })
    }

  if (items.length > 0) {
    for (const item of items) {
      await db.insert(catalogItems).values(item).onConflictDoNothing()
      console.log(`  Inserted: ${item.id}`)
    }
  }

  return items.length
}

async function main() {
  console.log('Starting migration to Neon DB...\n')

  const types: ItemType[] = ['skill', 'agent', 'command', 'guide']
  let total = 0

  for (const type of types) {
    console.log(`Migrating ${type}s...`)
    const count = await migrateDirectory(type)
    console.log(`  ${count} ${type}(s) migrated\n`)
    total += count
  }

  console.log(`Migration complete! Total: ${total} items`)
}

main().catch(console.error)
