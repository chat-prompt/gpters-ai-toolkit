/**
 * Playground utilities for markdown parsing, code extraction, and syntax highlighting
 */

export interface CodeBlock {
  language: string
  code: string
  startLine: number
  endLine: number
}

export interface ParsedMarkdown {
  title: string | null
  description: string | null
  codeBlocks: CodeBlock[]
  sections: MarkdownSection[]
  metadata: Record<string, string>
}

export interface MarkdownSection {
  level: number
  title: string
  content: string
  startLine: number
}

/**
 * Extract code blocks from markdown content
 */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const codeBlocks: CodeBlock[] = []
  const lines = markdown.split('\n')

  let inCodeBlock = false
  let currentLanguage = ''
  let currentCode: string[] = []
  let startLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Starting a code block
        inCodeBlock = true
        currentLanguage = line.slice(3).trim() || 'text'
        currentCode = []
        startLine = i + 1
      } else {
        // Ending a code block
        codeBlocks.push({
          language: currentLanguage,
          code: currentCode.join('\n'),
          startLine,
          endLine: i - 1,
        })
        inCodeBlock = false
        currentLanguage = ''
        currentCode = []
      }
    } else if (inCodeBlock) {
      currentCode.push(line)
    }
  }

  return codeBlocks
}

/**
 * Extract YAML frontmatter from markdown
 */
export function extractFrontmatter(markdown: string): Record<string, string> {
  const metadata: Record<string, string> = {}

  if (!markdown.startsWith('---')) {
    return metadata
  }

  const endIndex = markdown.indexOf('---', 3)
  if (endIndex === -1) {
    return metadata
  }

  const frontmatter = markdown.slice(3, endIndex).trim()
  const lines = frontmatter.split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '')
      metadata[key] = value
    }
  }

  return metadata
}

/**
 * Remove frontmatter from markdown content
 */
export function removeFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) {
    return markdown
  }

  const endIndex = markdown.indexOf('---', 3)
  if (endIndex === -1) {
    return markdown
  }

  return markdown.slice(endIndex + 3).trim()
}

/**
 * Extract sections from markdown (headers and their content)
 */
export function extractSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  const lines = markdown.split('\n')

  let currentSection: MarkdownSection | null = null
  let contentLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim()
        sections.push(currentSection)
      }

      // Start new section
      currentSection = {
        level: headerMatch[1].length,
        title: headerMatch[2].trim(),
        content: '',
        startLine: i,
      }
      contentLines = []
    } else if (currentSection) {
      contentLines.push(line)
    }
  }

  // Add the last section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim()
    sections.push(currentSection)
  }

  return sections
}

/**
 * Extract title from markdown (first H1 header)
 */
export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Extract description (first paragraph after title or frontmatter)
 */
export function extractDescription(markdown: string): string | null {
  const content = removeFrontmatter(markdown)
  const lines = content.split('\n')

  let foundTitle = false
  const descriptionLines: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip empty lines at the beginning
    if (!foundTitle && trimmedLine === '') continue

    // Skip title line
    if (trimmedLine.startsWith('#')) {
      foundTitle = true
      continue
    }

    // After title, collect non-empty lines until we hit another header or empty line
    if (foundTitle) {
      if (trimmedLine === '' && descriptionLines.length > 0) {
        break
      }
      if (trimmedLine.startsWith('#')) {
        break
      }
      if (trimmedLine !== '') {
        descriptionLines.push(trimmedLine)
      }
    }
  }

  return descriptionLines.length > 0 ? descriptionLines.join(' ') : null
}

/**
 * Parse markdown content into structured data
 */
export function parseMarkdown(markdown: string): ParsedMarkdown {
  return {
    title: extractTitle(markdown),
    description: extractDescription(markdown),
    codeBlocks: extractCodeBlocks(markdown),
    sections: extractSections(removeFrontmatter(markdown)),
    metadata: extractFrontmatter(markdown),
  }
}

/**
 * Language aliases for syntax highlighting
 */
export const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  json5: 'json',
  dockerfile: 'docker',
}

/**
 * Normalize language name for consistent syntax highlighting
 */
export function normalizeLanguage(language: string): string {
  const lower = language.toLowerCase()
  return LANGUAGE_ALIASES[lower] || lower
}

/**
 * Get file extension for a language
 */
export function getFileExtension(language: string): string {
  const extensions: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    ruby: 'rb',
    bash: 'sh',
    yaml: 'yml',
    markdown: 'md',
    json: 'json',
    html: 'html',
    css: 'css',
    sql: 'sql',
    go: 'go',
    rust: 'rs',
    java: 'java',
    kotlin: 'kt',
    swift: 'swift',
  }

  const normalized = normalizeLanguage(language)
  return extensions[normalized] || language
}

/**
 * Generate MCP prompt command for a catalog item
 *
 * Returns the MCP prompt invocation command which is the only
 * functional method to use items from this platform.
 */
export function generateClaudeCommand(itemId: string, _pluginId?: string): string {
  return `/mcp__gpters-ai-toolkit__${itemId}`
}

/**
 * Generate a shareable URL for the playground
 */
export function generateShareUrl(baseUrl: string, skillId: string): string {
  return `${baseUrl}/playground/${skillId}`
}

/**
 * Escape HTML special characters for safe display
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char])
}

/**
 * Add line numbers to code for display
 */
export function addLineNumbers(code: string): { line: number; content: string }[] {
  return code.split('\n').map((content, index) => ({
    line: index + 1,
    content,
  }))
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Count lines in a string
 */
export function countLines(text: string): number {
  return text.split('\n').length
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Extract usage examples from skill content
 * Looks for sections like "Usage", "Examples", "How to use", etc.
 */
export function extractUsageExamples(markdown: string): CodeBlock[] {
  const sections = extractSections(markdown)
  const usageKeywords = ['usage', 'example', 'how to', 'getting started', 'quick start', '사용법', '예제', '시작하기']

  const usageSections = sections.filter((section) =>
    usageKeywords.some((keyword) =>
      section.title.toLowerCase().includes(keyword)
    )
  )

  const examples: CodeBlock[] = []

  for (const section of usageSections) {
    const codeBlocks = extractCodeBlocks(section.content)
    examples.push(...codeBlocks)
  }

  return examples
}

/**
 * Determine if content is primarily markdown or code
 */
export function detectContentType(content: string): 'markdown' | 'code' | 'mixed' {
  const codeBlocks = extractCodeBlocks(content)
  const lines = content.split('\n')
  const codeLines = codeBlocks.reduce((acc, block) => acc + block.endLine - block.startLine + 1, 0)
  const codeRatio = codeLines / lines.length

  if (codeRatio > 0.7) return 'code'
  if (codeRatio < 0.2) return 'markdown'
  return 'mixed'
}
