/**
 * Copy button component for clipboard operations
 *
 * Provides a simple button that copies text to the clipboard with optional callback.
 */
'use client'

/**
 * Props for the CopyButton component
 */
interface CopyButtonProps {
  /** The text content to copy to clipboard */
  text: string
  /** Optional callback fired after successful copy */
  onCopy?: () => void
}

/**
 * A button that copies text to the clipboard when clicked
 *
 * Uses the Clipboard API to copy text and provides visual feedback.
 *
 * @example
 * ```tsx
 * <CopyButton text="npm install package" onCopy={() => console.log('Copied!')} />
 * ```
 */
export function CopyButton({ text, onCopy }: CopyButtonProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      onCopy?.()
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-medium hover:text-[var(--accent-cyan)] transition-colors"
    >
      <span>⧉</span>
      <span>Copy</span>
    </button>
  )
}
