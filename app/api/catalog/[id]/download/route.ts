import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems, users } from '@/lib/db'
import JSZip from 'jszip'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import type { PluginFile, ItemType } from '@/lib/core/types'

const log = createLogger('api:catalog:download')

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Get the main content filename based on item type
 */
function getMainContentFilename(type: ItemType): string {
  switch (type) {
    case 'skill':
      return 'skill.md'
    case 'agent':
      return 'agent.md'
    case 'command':
      return 'command.md'
    case 'hook':
      return 'hook.md'
    case 'guide':
      return 'guide.md'
    default:
      return 'content.md'
  }
}

/**
 * Generate INSTALL.md with setup instructions
 */
function generateInstallMd(item: {
  id: string
  name: string
  type: ItemType
  description: string
  authorName: string
  version?: string | null
  pluginId?: string | null
  dependencies?: string[] | null
}): string {
  const lines: string[] = [
    `# ${item.name}`,
    '',
    `> ${item.description}`,
    '',
    `- **Type**: ${item.type}`,
    `- **Author**: @${item.authorName}`,
  ]

  if (item.version) {
    lines.push(`- **Version**: ${item.version}`)
  }

  lines.push('')
  lines.push('## Installation')
  lines.push('')

  if (item.type === 'skill' || item.type === 'agent' || item.type === 'command') {
    lines.push('### Option 1: Claude Code Marketplace (Recommended)')
    lines.push('')
    lines.push('If this item is published to the marketplace, you can install it using:')
    lines.push('')
    lines.push('```bash')
    if (item.pluginId) {
      lines.push(`claude mcp add ${item.pluginId}`)
    } else {
      lines.push(`claude mcp add <plugin-id>`)
    }
    lines.push('```')
    lines.push('')
    lines.push('### Option 2: Manual Installation')
    lines.push('')
  }

  lines.push('1. Copy the files to your Claude Code configuration directory:')
  lines.push('')

  switch (item.type) {
    case 'skill':
      lines.push('   - Copy `skill.md` to `~/.claude/skills/` or your project\'s `.claude/skills/` directory')
      break
    case 'agent':
      lines.push('   - Copy the agent file to `~/.claude/agents/` or your project\'s `.claude/agents/` directory')
      break
    case 'command':
      lines.push('   - Copy the command file to `~/.claude/commands/` or your project\'s `.claude/commands/` directory')
      break
    case 'hook':
      lines.push('   - Add the hook configuration to your `~/.claude/settings.json` or `.claude/settings.local.json`')
      break
    default:
      lines.push('   - Follow the instructions in the README.md or content file')
  }

  lines.push('')

  if (item.dependencies && item.dependencies.length > 0) {
    lines.push('## Dependencies')
    lines.push('')
    lines.push('This item requires the following dependencies:')
    lines.push('')
    item.dependencies.forEach(dep => {
      lines.push(`- ${dep}`)
    })
    lines.push('')
  }

  lines.push('## Files Included')
  lines.push('')
  lines.push('This ZIP archive contains:')
  lines.push('')
  lines.push(`- \`${getMainContentFilename(item.type)}\` - Main content file`)
  lines.push('- `README.md` - Documentation (if available)')
  lines.push('- Additional files as needed')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`Downloaded from GPTers AI Toolkit`)

  return lines.join('\n')
}

/**
 * Calculate estimated size of all files
 */
function calculateTotalSize(item: {
  content: string
  readme?: string | null
  files?: PluginFile[] | null
}): number {
  let size = Buffer.byteLength(item.content, 'utf8')

  if (item.readme) {
    size += Buffer.byteLength(item.readme, 'utf8')
  }

  if (item.files && Array.isArray(item.files)) {
    for (const file of item.files) {
      size += Buffer.byteLength(file.content, 'utf8')
    }
  }

  return size
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  // Rate limit: 30 downloads per minute to prevent abuse
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await params
    const [item] = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        type: catalogItems.type,
        description: catalogItems.description,
        authorName: users.name,
        content: catalogItems.content,
        readme: catalogItems.readme,
        files: catalogItems.files,
        version: catalogItems.version,
        pluginId: catalogItems.pluginId,
        dependencies: catalogItems.dependencies,
      })
      .from(catalogItems)
      .leftJoin(users, eq(catalogItems.authorId, users.id))
      .where(eq(catalogItems.id, id))

    if (!item) {
      return NextResponse.json(
        { error: 'Catalog item not found' },
        { status: 404 }
      )
    }

    // Check if item has content to download
    if (!item.content) {
      return NextResponse.json(
        { error: 'Item has no content to download' },
        { status: 400 }
      )
    }

    // Create ZIP file
    const zip = new JSZip()

    // Add main content file
    const mainFilename = getMainContentFilename(item.type as ItemType)
    zip.file(mainFilename, item.content)

    // Add README if exists
    if (item.readme) {
      zip.file('README.md', item.readme)
    }

    // Add additional files if they exist
    if (item.files && Array.isArray(item.files)) {
      for (const file of item.files as PluginFile[]) {
        if (file.name && file.content) {
          // Preserve directory structure in file names
          zip.file(file.name, file.content)
        }
      }
    }

    // Generate and add INSTALL.md
    const installMd = generateInstallMd({
      id: item.id,
      name: item.name,
      type: item.type as ItemType,
      description: item.description,
      authorName: item.authorName || 'Unknown',
      version: item.version,
      pluginId: item.pluginId,
      dependencies: item.dependencies,
    })
    zip.file('INSTALL.md', installMd)

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9,
      },
    })

    // Create filename for download
    const safeId = item.id.replace(/[^a-zA-Z0-9-_]/g, '-')
    const filename = `${safeId}.zip`

    log.info(`Download ZIP generated for item ${id}`, {
      itemId: id,
      itemType: item.type,
      fileCount: Object.keys(zip.files).length,
      zipSize: zipBuffer.length,
    })

    // Return ZIP file - convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    log.error('Failed to generate ZIP download', error)
    return NextResponse.json(
      { error: 'Failed to generate download' },
      { status: 500 }
    )
  }
}

/**
 * HEAD request to get file count and estimated size without downloading
 */
export async function HEAD(request: NextRequest, { params }: RouteParams) {
  // Rate limit
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await params
    const [item] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!item) {
      return new NextResponse(null, { status: 404 })
    }

    if (!item.content) {
      return new NextResponse(null, { status: 400 })
    }

    // Count files
    let fileCount = 1 // main content file
    if (item.readme) fileCount++
    if (item.files && Array.isArray(item.files)) {
      fileCount += item.files.length
    }
    fileCount++ // INSTALL.md

    // Calculate estimated size
    const estimatedSize = calculateTotalSize({
      content: item.content,
      readme: item.readme,
      files: item.files as PluginFile[] | null,
    })

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-File-Count': fileCount.toString(),
        'X-Estimated-Size': estimatedSize.toString(),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    log.error('Failed to get download info', error)
    return new NextResponse(null, { status: 500 })
  }
}
