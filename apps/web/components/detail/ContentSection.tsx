/**
 * 마크다운 본문 구획
 *
 * 제목 줄과 복사 버튼을 얹고, 본문은 한 단 안쪽 면에 깔아 카드와 구분한다.
 */
import { CopyButton } from '../ui/CopyButton'
import { MarkdownContent } from '../ui/MarkdownContent'

/**
 * Props for the ContentSection component
 */
interface ContentSectionProps {
  /** 구획 제목 — 대개 파일 이름이라 고정폭으로 보여준다 */
  title: string
  /** 마크다운 본문 */
  content: string
  /** 복사 버튼 노출 여부 */
  showCopy?: boolean
}

/**
 * 마크다운 앞머리(YAML frontmatter)를 걷어낸다
 *
 * @param content - frontmatter가 남아 있을 수 있는 원본 마크다운
 * @returns frontmatter를 뺀 본문
 */
function removeFrontmatter(content: string): string {
  const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
  return content.replace(frontmatterRegex, '').trim()
}

/**
 * 마크다운 본문 카드
 *
 * @param title - 구획 제목
 * @param content - 마크다운 본문
 * @param showCopy - 복사 버튼 노출 여부
 *
 * @example
 * ```tsx
 * <ContentSection title="skill.md" content={markdownContent} />
 * ```
 */
export function ContentSection({
  title,
  content,
  showCopy = true,
}: ContentSectionProps) {
  const cleanContent = removeFrontmatter(content)

  return (
    <div className="surface-card mb-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-mono text-sm text-[var(--text-primary)]">{title}</h2>
        {showCopy && <CopyButton text={cleanContent} />}
      </div>

      {/* 읽는 면은 카드보다 한 단 눕혀 본문과 카드 테두리를 구분한다 */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-6">
        <MarkdownContent content={cleanContent} />
      </div>
    </div>
  )
}
