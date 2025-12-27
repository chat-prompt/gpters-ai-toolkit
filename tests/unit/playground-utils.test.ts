import { describe, it, expect } from 'vitest'
import {
  extractCodeBlocks,
  extractFrontmatter,
  removeFrontmatter,
  extractSections,
  extractTitle,
  extractDescription,
  parseMarkdown,
  normalizeLanguage,
  getFileExtension,
  generateClaudeCommand,
  generateShareUrl,
  escapeHtml,
  addLineNumbers,
  truncateText,
  countLines,
  formatFileSize,
  extractUsageExamples,
  detectContentType,
  LANGUAGE_ALIASES,
} from '@/lib/playground-utils'

describe('Playground Utils', () => {
  describe('extractCodeBlocks', () => {
    it('extracts single code block', () => {
      const markdown = `Some text

\`\`\`javascript
const x = 1;
console.log(x);
\`\`\`

More text`

      const blocks = extractCodeBlocks(markdown)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].language).toBe('javascript')
      expect(blocks[0].code).toBe('const x = 1;\nconsole.log(x);')
    })

    it('extracts multiple code blocks', () => {
      const markdown = `
\`\`\`python
def hello():
    print("Hello")
\`\`\`

\`\`\`bash
echo "Hello"
\`\`\`
`

      const blocks = extractCodeBlocks(markdown)
      expect(blocks).toHaveLength(2)
      expect(blocks[0].language).toBe('python')
      expect(blocks[1].language).toBe('bash')
    })

    it('handles code blocks without language', () => {
      const markdown = `
\`\`\`
plain text
\`\`\`
`
      const blocks = extractCodeBlocks(markdown)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].language).toBe('text')
    })

    it('returns empty array for markdown without code blocks', () => {
      const markdown = 'Just some text without code blocks'
      const blocks = extractCodeBlocks(markdown)
      expect(blocks).toHaveLength(0)
    })

    it('tracks correct line numbers', () => {
      const markdown = `Line 1
Line 2
\`\`\`js
code line 1
code line 2
\`\`\`
Line after`

      const blocks = extractCodeBlocks(markdown)
      expect(blocks[0].startLine).toBe(3)
      expect(blocks[0].endLine).toBe(4)
    })
  })

  describe('extractFrontmatter', () => {
    it('extracts YAML frontmatter', () => {
      const markdown = `---
title: Test Title
author: John Doe
version: 1.0.0
---

# Content`

      const metadata = extractFrontmatter(markdown)
      expect(metadata.title).toBe('Test Title')
      expect(metadata.author).toBe('John Doe')
      expect(metadata.version).toBe('1.0.0')
    })

    it('returns empty object for markdown without frontmatter', () => {
      const markdown = '# Just a title\n\nSome content'
      const metadata = extractFrontmatter(markdown)
      expect(Object.keys(metadata)).toHaveLength(0)
    })

    it('handles quoted values', () => {
      const markdown = `---
title: "Quoted Title"
description: 'Single quoted'
---`

      const metadata = extractFrontmatter(markdown)
      expect(metadata.title).toBe('Quoted Title')
      expect(metadata.description).toBe('Single quoted')
    })

    it('handles values with colons', () => {
      const markdown = `---
url: https://example.com
---`

      const metadata = extractFrontmatter(markdown)
      expect(metadata.url).toBe('https://example.com')
    })
  })

  describe('removeFrontmatter', () => {
    it('removes frontmatter from markdown', () => {
      const markdown = `---
title: Test
---

# Content here`

      const content = removeFrontmatter(markdown)
      expect(content).toBe('# Content here')
    })

    it('returns original content if no frontmatter', () => {
      const markdown = '# Title\n\nContent'
      const content = removeFrontmatter(markdown)
      expect(content).toBe(markdown)
    })
  })

  describe('extractSections', () => {
    it('extracts sections from headers', () => {
      const markdown = `# Main Title

Some intro text

## Section 1

Content for section 1

## Section 2

Content for section 2`

      const sections = extractSections(markdown)
      expect(sections).toHaveLength(3)
      expect(sections[0].title).toBe('Main Title')
      expect(sections[0].level).toBe(1)
      expect(sections[1].title).toBe('Section 1')
      expect(sections[1].level).toBe(2)
    })

    it('handles nested headers', () => {
      const markdown = `# H1
## H2
### H3`

      const sections = extractSections(markdown)
      expect(sections).toHaveLength(3)
      expect(sections[2].level).toBe(3)
    })
  })

  describe('extractTitle', () => {
    it('extracts first H1 header', () => {
      const markdown = `# My Title

Some content

## Another Header`

      expect(extractTitle(markdown)).toBe('My Title')
    })

    it('returns null for markdown without H1', () => {
      const markdown = '## Just H2\n\nContent'
      expect(extractTitle(markdown)).toBeNull()
    })
  })

  describe('extractDescription', () => {
    it('extracts first paragraph after title', () => {
      const markdown = `# Title

This is the description paragraph.

## Next Section`

      expect(extractDescription(markdown)).toBe('This is the description paragraph.')
    })

    it('handles multi-line descriptions', () => {
      const markdown = `# Title

Line one of description
Line two of description

## Next`

      const desc = extractDescription(markdown)
      expect(desc).toContain('Line one')
      expect(desc).toContain('Line two')
    })

    it('returns null for markdown without description', () => {
      const markdown = `# Title
## Next`
      expect(extractDescription(markdown)).toBeNull()
    })
  })

  describe('parseMarkdown', () => {
    it('parses complete markdown document', () => {
      const markdown = `---
author: Test
---

# My Document

This is the description.

## Section 1

\`\`\`js
const x = 1;
\`\`\`
`

      const parsed = parseMarkdown(markdown)
      expect(parsed.title).toBe('My Document')
      expect(parsed.description).toBe('This is the description.')
      expect(parsed.codeBlocks).toHaveLength(1)
      expect(parsed.sections).toHaveLength(2)
      expect(parsed.metadata.author).toBe('Test')
    })
  })

  describe('normalizeLanguage', () => {
    it('normalizes common language aliases', () => {
      expect(normalizeLanguage('js')).toBe('javascript')
      expect(normalizeLanguage('ts')).toBe('typescript')
      expect(normalizeLanguage('py')).toBe('python')
      expect(normalizeLanguage('sh')).toBe('bash')
    })

    it('returns lowercase for unknown languages', () => {
      expect(normalizeLanguage('RUST')).toBe('rust')
      expect(normalizeLanguage('Go')).toBe('go')
    })
  })

  describe('getFileExtension', () => {
    it('returns correct extensions for languages', () => {
      expect(getFileExtension('javascript')).toBe('js')
      expect(getFileExtension('typescript')).toBe('ts')
      expect(getFileExtension('python')).toBe('py')
      expect(getFileExtension('bash')).toBe('sh')
    })

    it('handles aliases', () => {
      expect(getFileExtension('js')).toBe('js')
      expect(getFileExtension('ts')).toBe('ts')
    })

    it('returns language for unknown extensions', () => {
      expect(getFileExtension('unknown')).toBe('unknown')
    })
  })

  describe('generateClaudeCommand', () => {
    it('generates install command with pluginId', () => {
      const cmd = generateClaudeCommand('my-skill', 'my-plugin')
      expect(cmd).toBe('/install my-plugin')
    })

    it('generates skill command without pluginId', () => {
      const cmd = generateClaudeCommand('my-skill')
      expect(cmd).toBe('/skill my-skill')
    })
  })

  describe('generateShareUrl', () => {
    it('generates correct share URL', () => {
      const url = generateShareUrl('https://example.com', 'my-skill')
      expect(url).toBe('https://example.com/playground/my-skill')
    })
  })

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
      expect(escapeHtml('a & b')).toBe('a &amp; b')
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
      expect(escapeHtml("'single'")).toBe('&#39;single&#39;')
    })
  })

  describe('addLineNumbers', () => {
    it('adds line numbers to code', () => {
      const code = 'line 1\nline 2\nline 3'
      const lines = addLineNumbers(code)
      expect(lines).toHaveLength(3)
      expect(lines[0]).toEqual({ line: 1, content: 'line 1' })
      expect(lines[1]).toEqual({ line: 2, content: 'line 2' })
      expect(lines[2]).toEqual({ line: 3, content: 'line 3' })
    })
  })

  describe('truncateText', () => {
    it('truncates long text', () => {
      const text = 'This is a very long text that should be truncated'
      const truncated = truncateText(text, 20)
      expect(truncated).toBe('This is a very lo...')
      expect(truncated.length).toBe(20)
    })

    it('returns original text if shorter than max', () => {
      const text = 'Short'
      expect(truncateText(text, 20)).toBe('Short')
    })
  })

  describe('countLines', () => {
    it('counts lines correctly', () => {
      expect(countLines('one')).toBe(1)
      expect(countLines('one\ntwo')).toBe(2)
      expect(countLines('one\ntwo\nthree')).toBe(3)
    })
  })

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B')
    })

    it('formats kilobytes', () => {
      expect(formatFileSize(2048)).toBe('2.0 KB')
    })

    it('formats megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB')
    })
  })

  describe('extractUsageExamples', () => {
    it('extracts code blocks from usage sections', () => {
      const markdown = `# Title

## Usage

\`\`\`bash
echo "example"
\`\`\`

## Other

\`\`\`js
// not usage
\`\`\`
`

      const examples = extractUsageExamples(markdown)
      expect(examples).toHaveLength(1)
      expect(examples[0].language).toBe('bash')
    })

    it('handles Korean usage section titles', () => {
      const markdown = `# 제목

## 사용법

\`\`\`python
print("example")
\`\`\`
`

      const examples = extractUsageExamples(markdown)
      expect(examples).toHaveLength(1)
    })
  })

  describe('detectContentType', () => {
    it('detects code-heavy content', () => {
      // Create content where code lines are >70% of total lines
      const markdown = `\`\`\`js
const a = 1;
const b = 2;
const c = 3;
const d = 4;
const e = 5;
const f = 6;
const g = 7;
const h = 8;
const i = 9;
const j = 10;
\`\`\``
      expect(detectContentType(markdown)).toBe('code')
    })

    it('detects markdown-heavy content', () => {
      const markdown = `# Title

This is a paragraph of text.

Another paragraph here.

And more text content.

Final paragraph.`

      expect(detectContentType(markdown)).toBe('markdown')
    })

    it('detects mixed content', () => {
      // Content where code is between 20% and 70%
      const markdown = `# Title

Some text here.

\`\`\`js
const x = 1;
const y = 2;
const z = 3;
const w = 4;
\`\`\`

More text.`

      expect(detectContentType(markdown)).toBe('mixed')
    })
  })

  describe('LANGUAGE_ALIASES', () => {
    it('contains common aliases', () => {
      expect(LANGUAGE_ALIASES.js).toBe('javascript')
      expect(LANGUAGE_ALIASES.ts).toBe('typescript')
      expect(LANGUAGE_ALIASES.py).toBe('python')
      expect(LANGUAGE_ALIASES.rb).toBe('ruby')
      expect(LANGUAGE_ALIASES.sh).toBe('bash')
      expect(LANGUAGE_ALIASES.shell).toBe('bash')
    })
  })
})
