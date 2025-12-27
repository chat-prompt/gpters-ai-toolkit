'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import Link from 'next/link'

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-medium text-[var(--text-primary)] mt-10 mb-6">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-medium text-[var(--text-primary)] mt-10 mb-4">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-medium text-[var(--text-primary)] mt-8 mb-4">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-4 text-[var(--text-secondary)] leading-relaxed">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
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
              <code className="text-sm text-emerald-400">{children}</code>
            )
          }
          return (
            <code className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-emerald-400 text-sm">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="bg-[var(--bg-primary)] rounded-xl p-4 my-4 overflow-x-auto">
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
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
