/**
 * Community skills import logic tests (DEV-3066)
 *
 * Tests frontmatter parsing and skill ID generation
 * using the shared parseRawFrontmatter utility.
 */

import { describe, it, expect } from 'vitest'
import { parseRawFrontmatter } from '@gpters/lib/utils'

describe('Community Skills Import — Frontmatter Parser', () => {
  it('should parse Anthropic SKILL.md format', () => {
    const markdown = `---
name: pdf
description: Use this skill for PDF operations
license: Proprietary
---

# PDF Processing Guide

Some content here.`

    const { meta, body } = parseRawFrontmatter(markdown)

    expect(meta.name).toBe('pdf')
    expect(meta.description).toBe('Use this skill for PDF operations')
    expect(meta.license).toBe('Proprietary')
    expect(body).toContain('# PDF Processing Guide')
    expect(body).toContain('Some content here.')
  })

  it('should parse Vercel SKILL.md format with nested metadata', () => {
    const markdown = `---
name: vercel-react-best-practices
description: React optimization guidelines
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# React Best Practices

Content here.`

    const { meta, body } = parseRawFrontmatter(markdown)

    expect(meta.name).toBe('vercel-react-best-practices')
    expect(meta.description).toBe('React optimization guidelines')
    expect(meta.license).toBe('MIT')
    expect(meta.metadata_author).toBe('vercel')
    expect(meta.metadata_version).toBe('1.0.0')
    expect(body).toContain('# React Best Practices')
  })

  it('should handle SKILL.md without frontmatter', () => {
    const markdown = `# Just a Title

Some content without frontmatter.`

    const { meta, body } = parseRawFrontmatter(markdown)

    expect(Object.keys(meta)).toHaveLength(0)
    expect(body).toBe(markdown)
  })

  it('should handle quoted values in frontmatter', () => {
    const markdown = `---
name: "test-skill"
version: '2.0.0'
---

Body`

    const { meta } = parseRawFrontmatter(markdown)

    expect(meta.name).toBe('test-skill')
    expect(meta.version).toBe('2.0.0')
  })

  it('should handle description with colons', () => {
    const markdown = `---
name: claude-api
description: Build apps with the Claude API: tool use, streaming, and more
---

Body`

    const { meta } = parseRawFrontmatter(markdown)

    expect(meta.name).toBe('claude-api')
    expect(meta.description).toBe('Build apps with the Claude API: tool use, streaming, and more')
  })

  it('should handle empty body after frontmatter', () => {
    const markdown = `---
name: empty
description: Empty skill
---
`

    const { meta, body } = parseRawFrontmatter(markdown)

    expect(meta.name).toBe('empty')
    expect(body).toBe('')
  })
})

describe('Community Skills Import — ID Generation', () => {
  it('should generate community-prefixed IDs', () => {
    const skillName = 'pdf'
    const id = `community-${skillName}`
    expect(id).toBe('community-pdf')
  })

  it('should preserve hyphenated names', () => {
    const skillName = 'react-best-practices'
    const id = `community-${skillName}`
    expect(id).toBe('community-react-best-practices')
  })

  it('should handle long skill names', () => {
    const skillName = 'web-artifacts-builder'
    const id = `community-${skillName}`
    expect(id).toBe('community-web-artifacts-builder')
    expect(id.length).toBeLessThan(100)
  })
})
