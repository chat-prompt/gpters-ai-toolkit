import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, PluginFile } from '@/lib/core/types'
import { ApiErrors, requirePermissionAsync, getCurrentUser } from '@/lib/utils/api-utils'
import { Permissions } from '@/lib/security/rbac'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:catalog:upload')

// Main content file patterns for each type
const MAIN_CONTENT_FILES: Record<ItemType, string[]> = {
  skill: ['SKILL.md', 'skill.md'],
  agent: ['AGENT.md', 'agent.md'],
  command: ['COMMAND.md', 'command.md'],
  guide: ['GUIDE.md', 'guide.md', 'index.md'],
  hook: ['HOOK.md', 'hook.md'],
  package: ['PACKAGE.md', 'package.md', 'index.md'],
}

// Files to treat as readme
const README_FILES = ['README.md', 'readme.md', 'Readme.md']

// Files to exclude from additional files
const EXCLUDED_FILES = [
  '.DS_Store',
  'Thumbs.db',
  '.gitignore',
  '.git',
]

interface ExtractedContent {
  mainContent: string | null
  readme: string | null
  files: PluginFile[]
  metadata: Record<string, string>
}

/**
 * Extract content from a ZIP file
 */
async function extractZipContent(
  zipBuffer: ArrayBuffer,
  itemType: ItemType
): Promise<ExtractedContent> {
  const zip = await JSZip.loadAsync(zipBuffer)
  const result: ExtractedContent = {
    mainContent: null,
    readme: null,
    files: [],
    metadata: {},
  }

  const mainContentPatterns = MAIN_CONTENT_FILES[itemType]

  for (const [relativePath, file] of Object.entries(zip.files)) {
    // Skip directories
    if (file.dir) continue

    // Get just the filename
    const fileName = relativePath.split('/').pop() || relativePath

    // Skip excluded files
    if (EXCLUDED_FILES.some((ex) => fileName === ex || relativePath.includes(ex))) {
      continue
    }

    // Read file content
    const content = await file.async('text')

    // Check if this is the main content file
    if (mainContentPatterns.some((pattern) => fileName === pattern)) {
      result.mainContent = content
      continue
    }

    // Check if this is a readme file
    if (README_FILES.includes(fileName)) {
      result.readme = content
      continue
    }

    // Determine file type hint
    let type: string | undefined
    if (fileName.endsWith('.md')) {
      type = 'markdown'
    } else if (fileName.endsWith('.sh') || fileName.endsWith('.bash')) {
      type = 'bash'
    } else if (fileName.endsWith('.py')) {
      type = 'python'
    } else if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
      type = 'javascript'
    } else if (fileName.endsWith('.json')) {
      type = 'json'
    } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
      type = 'yaml'
    }

    // Add to additional files
    result.files.push({
      name: fileName,
      content,
      type,
    })
  }

  return result
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): { metadata: Record<string, string>; content: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

  if (!frontmatterMatch) {
    return { metadata: {}, content }
  }

  const [, frontmatter, body] = frontmatterMatch
  const metadata: Record<string, string> = {}

  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      metadata[key] = value
    }
  }

  return { metadata, content: body.trim() }
}

export async function POST(request: NextRequest) {
  // Check RBAC permission for creating catalog items
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_CREATE, request)
  if (permissionError) return permissionError

  // Get current user for authorId
  const currentUser = await getCurrentUser()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const idParam = formData.get('id') as string | null
    const typeParam = formData.get('type') as ItemType | null
    const updateExisting = formData.get('update') === 'true'

    if (!file) {
      return ApiErrors.badRequest('No file provided')
    }

    if (!file.name.endsWith('.zip')) {
      return ApiErrors.badRequest('File must be a ZIP archive')
    }

    const itemType = typeParam || 'skill'
    const zipBuffer = await file.arrayBuffer()
    const extracted = await extractZipContent(zipBuffer, itemType)

    if (!extracted.mainContent) {
      return ApiErrors.badRequest(
        `Main content file not found. Expected one of: ${MAIN_CONTENT_FILES[itemType].join(', ')}`
      )
    }

    // Parse frontmatter from main content
    const { metadata, content } = parseFrontmatter(extracted.mainContent)

    // Generate ID from file name or use provided
    const id = idParam || file.name.replace('.zip', '').toLowerCase().replace(/\s+/g, '-')

    // Check if item exists
    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (existing && !updateExisting) {
      return ApiErrors.conflict(`Item with ID '${id}' already exists. Set update=true to overwrite.`)
    }

    // Determine author display name: metadata > user name > email prefix > 'unknown'
    const authorDisplayName = metadata.author
      || currentUser?.name
      || currentUser?.email?.split('@')[0]
      || 'unknown'

    const itemData = {
      id,
      type: itemType,
      name: metadata.name || id,
      description: metadata.description || '',
      author: authorDisplayName,
      authorId: currentUser?.id || null,
      tags: metadata.tags ? metadata.tags.split(',').map((t) => t.trim()) : [],
      teamTag: (metadata.teamTag as TeamTag) || 'general',
      difficulty: (metadata.difficulty as Difficulty) || null,
      pluginId: metadata.pluginId || null,
      content,
      readme: extracted.readme || null,
      files: extracted.files.length > 0 ? extracted.files : null,
      marketplaceEnabled: metadata.marketplaceEnabled === 'true',
      marketplaceVersion: metadata.version || '1.0.0',
      updatedAt: new Date(),
    }

    if (existing) {
      // Update existing item
      await db.update(catalogItems).set(itemData).where(eq(catalogItems.id, id))
    } else {
      // Insert new item
      await db.insert(catalogItems).values({
        ...itemData,
        likes: 0,
        dependencies: [],
      })
    }

    const [result] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    return NextResponse.json(
      {
        success: true,
        item: result,
        extracted: {
          mainContentFound: true,
          readmeFound: !!extracted.readme,
          additionalFilesCount: extracted.files.length,
          additionalFiles: extracted.files.map((f) => f.name),
        },
      },
      { status: existing ? 200 : 201 }
    )
  } catch (error) {
    log.error('ZIP upload failed', error)
    return ApiErrors.internalError(
      error instanceof Error ? error.message : 'Failed to process ZIP file'
    )
  }
}
