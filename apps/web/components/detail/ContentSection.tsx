/**
 * Content section component for displaying markdown content
 *
 * Renders markdown content in a styled card with optional
 * copy button and customizable icon.
 */
import { CopyButton } from '../ui/CopyButton'
import { MarkdownContent } from '../ui/MarkdownContent'

/**
 * Props for the ContentSection component
 */
interface ContentSectionProps {
  /** Section title */
  title: string
  /** Icon emoji for the section header */
  icon?: string
  /** Markdown content to render */
  content: string
  /** Whether to show copy button */
  showCopy?: boolean
}

/**
 * Styled section with markdown content and copy functionality
 *
 * @example
 * ```tsx
 * <ContentSection
 *   title="Documentation"
 *   icon="📄"
 *   content={markdownContent}
 *   showCopy={true}
 * />
 * ```
 */
export function ContentSection({
  title,
  icon = '📄',
  content,
  showCopy = true,
}: ContentSectionProps) {
  return (
    <div className="glass rounded-2xl p-8 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h2 className="text-lg font-medium text-[var(--text-primary)]">{title}</h2>
        </div>
        {showCopy && <CopyButton text={content} />}
      </div>

      <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
        <MarkdownContent content={content} />
      </div>
    </div>
  )
}
