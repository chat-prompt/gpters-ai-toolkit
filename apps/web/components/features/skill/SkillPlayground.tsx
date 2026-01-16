/**
 * Skill playground component
 *
 * Interactive code viewer with side-by-side or stacked layout,
 * line numbers, font size controls, and preview panel.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlaygroundToolbar, type LayoutMode, type FontSize } from '../../admin/PlaygroundToolbar'
import { SkillPreview } from './SkillPreview'
import { addLineNumbers, generateClaudeCommand, countLines } from '@/lib/features/playground-utils'
import type { CatalogItem } from '@/lib/core/types'

/** Props for SkillPlayground component */
interface SkillPlaygroundProps {
  /** Catalog item to display in playground */
  item: CatalogItem
  /** Base URL for share link generation */
  baseUrl?: string
}

/** Font size pixel values */
const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: '12px',
  medium: '14px',
  large: '16px',
}

/**
 * Interactive skill playground with editor and preview
 *
 * Features line-numbered code display, layout toggle,
 * font size controls, copy functionality, and Claude Code
 * command generation.
 */
export function SkillPlayground({ item, baseUrl = '' }: SkillPlaygroundProps) {
  const [layout, setLayout] = useState<LayoutMode>('side-by-side')
  const [fontSize, setFontSize] = useState<FontSize>('medium')
  const [editorContent] = useState(item.content)
  const [copied, setCopied] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Force stacked layout on mobile
  const effectiveLayout = isMobile ? 'stacked' : layout

  const shareUrl = `${baseUrl}/playground/${item.id}`
  const claudeCommand = generateClaudeCommand(item.id, item.pluginId)
  const lineCount = countLines(editorContent)
  const lines = addLineNumbers(editorContent)

  const handleCopyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editorContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [editorContent])

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(claudeCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy command:', err)
    }
  }, [claudeCommand])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <PlaygroundToolbar
        layout={layout}
        onLayoutChange={setLayout}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        shareUrl={shareUrl}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex min-h-0 ${
          effectiveLayout === 'stacked' ? 'flex-col' : 'flex-row'
        }`}
      >
        {/* Editor Panel */}
        <div
          className={`flex flex-col ${
            effectiveLayout === 'stacked' ? 'h-1/2' : 'w-1/2'
          } border-r border-[var(--border-subtle)]`}
        >
          {/* Editor Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-muted)]">skill.md</span>
              <span className="text-xs text-[var(--text-muted)]">{lineCount} lines</span>
            </div>
            <button
              onClick={handleCopyContent}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                copied
                  ? 'bg-[var(--accent-green)] text-[var(--bg-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}
              title="Copy content"
            >
              {copied ? (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
              <span>{copied ? '복사됨' : '복사'}</span>
            </button>
          </div>

          {/* Editor Content */}
          <div
            className="flex-1 overflow-auto font-mono bg-[var(--bg-primary)]"
            style={{ fontSize: FONT_SIZE_MAP[fontSize] }}
          >
            <div className="flex min-h-full">
              {/* Line Numbers */}
              <div className="flex-shrink-0 px-3 py-3 text-right select-none border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                {lines.map(({ line }) => (
                  <div
                    key={line}
                    className="text-[var(--text-muted)] leading-relaxed"
                    style={{ lineHeight: '1.5' }}
                  >
                    {line}
                  </div>
                ))}
              </div>

              {/* Code Content */}
              <div className="flex-1 p-3">
                <pre className="min-h-full">
                  {lines.map(({ line, content }) => (
                    <div
                      key={line}
                      className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words"
                      style={{ lineHeight: '1.5' }}
                    >
                      {content || '\u00A0'}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div
          className={`flex flex-col bg-[var(--bg-secondary)] ${
            effectiveLayout === 'stacked' ? 'h-1/2' : 'w-1/2'
          }`}
        >
          {/* Preview Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
            <span className="text-xs text-[var(--text-muted)]">Preview</span>
            <button
              onClick={handleCopyCommand}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-cyan)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity"
              title="Copy Claude Code command"
            >
              <span>▸</span>
              <span>Try in Claude Code</span>
            </button>
          </div>

          {/* Preview Content */}
          <SkillPreview item={{ ...item, content: editorContent }} />
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--text-muted)]">
            {item.type === 'skill' && '⚡ Skill'}
            {item.type === 'agent' && '◈ Agent'}
            {item.type === 'command' && '▸ Command'}
            {item.type === 'hook' && '🪝 Hook'}
            {item.type === 'guide' && '📚 Guide'}
          </span>
          {item.mcpEnabled && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
              MCP
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <code className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] text-[var(--accent-cyan)] font-mono">
            {claudeCommand}
          </code>
          <button
            onClick={handleCopyCommand}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            title="Copy command"
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
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
