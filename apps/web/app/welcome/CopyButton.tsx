'use client'

/**
 * MCP 커맨드 복사 버튼
 *
 * 클립보드에 텍스트를 복사하고 피드백을 표시하는 클라이언트 컴포넌트.
 */
import { useState } from 'react'

/**
 * CopyButton props
 */
interface CopyButtonProps {
  /** 복사할 텍스트 */
  text: string
}

/**
 * 클립보드 복사 버튼 with copied 상태 피드백
 *
 * @param text - 복사할 문자열
 */
export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
