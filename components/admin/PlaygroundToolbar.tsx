'use client'

import { useTheme } from '../layout/ThemeProvider'
import { useState, useEffect } from 'react'

export type LayoutMode = 'side-by-side' | 'stacked'
export type FontSize = 'small' | 'medium' | 'large'

interface PlaygroundToolbarProps {
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  fontSize: FontSize
  onFontSizeChange: (size: FontSize) => void
  shareUrl: string
}

export function PlaygroundToolbar({
  layout,
  onLayoutChange,
  fontSize,
  onFontSizeChange,
  shareUrl,
}: PlaygroundToolbarProps) {
  const { theme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydration pattern
    setMounted(true)
  }, [])

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy URL:', err)
    }
  }

  const fontSizes: { value: FontSize; label: string; icon: string }[] = [
    { value: 'small', label: '작게', icon: 'A' },
    { value: 'medium', label: '보통', icon: 'A' },
    { value: 'large', label: '크게', icon: 'A' },
  ]

  return (
    <div className="flex items-center gap-2 p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
      {/* Layout Toggle */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-tertiary)]">
        <button
          onClick={() => onLayoutChange('side-by-side')}
          className={`p-1.5 rounded transition-colors ${
            layout === 'side-by-side'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
          title="나란히 보기"
          aria-label="Side by side layout"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 4.5v15m6-15v15M4 4.5h16M4 19.5h16"
            />
          </svg>
        </button>
        <button
          onClick={() => onLayoutChange('stacked')}
          className={`p-1.5 rounded transition-colors ${
            layout === 'stacked'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
          title="세로로 보기"
          aria-label="Stacked layout"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 9h16M4 15h16M4 4.5v15M20 4.5v15"
            />
          </svg>
        </button>
      </div>

      {/* Font Size Controls */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-tertiary)]">
        {fontSizes.map((size, index) => (
          <button
            key={size.value}
            onClick={() => onFontSizeChange(size.value)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              fontSize === size.value
                ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
            style={{
              fontSize: index === 0 ? '10px' : index === 1 ? '12px' : '14px',
            }}
            title={size.label}
            aria-label={`Font size: ${size.label}`}
          >
            {size.icon}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme Toggle */}
      {mounted && (
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          title={`${theme === 'dark' ? '라이트' : '다크'} 모드로 전환`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>
      )}

      {/* Share Button */}
      <button
        onClick={handleShare}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          copied
            ? 'bg-[var(--accent-green)] text-[var(--bg-primary)]'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}
        title="URL 복사"
        aria-label="Copy share URL"
      >
        {copied ? (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-xs font-medium">복사됨</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span className="text-xs font-medium">공유</span>
          </>
        )}
      </button>
    </div>
  )
}
