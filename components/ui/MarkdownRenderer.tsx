'use client'

/**
 * Heavy Markdown Renderer Component
 *
 * This component is dynamically imported by MarkdownContent to reduce
 * initial bundle size. Contains react-markdown, remark-gfm, and rehype-sanitize.
 */

import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import Link from 'next/link'
import { memo, useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

/**
 * Props for the MarkdownRenderer component
 */
interface MarkdownRendererProps {
  /** Raw markdown string to render */
  content: string
}

// ============================================================================
// Custom Components
// ============================================================================

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-medium text-[var(--text-primary)] mt-10 mb-6">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-medium text-[var(--text-primary)] mt-10 mb-4">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-medium text-[var(--text-primary)] mt-8 mb-4">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-medium text-[var(--text-primary)] mt-6 mb-3">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-4 text-[var(--text-secondary)] leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-[var(--text-secondary)]">{children}</em>
  ),
  a: ({ href, children }) => {
    const isInternal = href?.startsWith('/')
    if (isInternal) {
      return (
        <Link href={href || '#'} className="text-emerald-400 hover:underline">
          {children}
        </Link>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
        {children}
      </a>
    )
  },
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="text-sm text-emerald-400 block">{children}</code>
      )
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-emerald-400 text-sm">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-4 my-4 overflow-x-auto font-mono text-sm leading-relaxed">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 space-y-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 space-y-2 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[var(--text-secondary)]">{children}</li>
  ),
  table: ({ children }) => (
    <div className="table-wrapper overflow-x-auto my-6 rounded-xl border border-[var(--border-subtle)]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[var(--bg-tertiary)]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left px-4 py-3 font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
      {children}
    </td>
  ),
  hr: () => (
    <hr className="my-8 border-[var(--border-subtle)]" />
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-emerald-500 pl-4 my-4 text-[var(--text-muted)] italic">
      {children}
    </blockquote>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ''}
      className="max-w-full h-auto rounded-lg my-4"
      loading="lazy"
    />
  ),
}

// ============================================================================
// Plugins Configuration
// ============================================================================

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeSanitize]

// ============================================================================
// Main Component
// ============================================================================

/**
 * Markdown renderer with GFM support and HTML sanitization
 *
 * Renders markdown content with GitHub Flavored Markdown extensions
 * and security-focused HTML sanitization.
 *
 * @example
 * ```tsx
 * <MarkdownRenderer content="# Hello **World**" />
 * ```
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Memoize the processed content to avoid unnecessary re-renders
  const memoizedContent = useMemo(() => content, [content])

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {memoizedContent}
    </ReactMarkdown>
  )
})
