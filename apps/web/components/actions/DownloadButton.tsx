/**
 * Download button component for catalog items
 *
 * Provides a download button that fetches catalog item files
 * as a ZIP archive with loading states and error handling.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

/** Props for DownloadButton component */
interface DownloadButtonProps {
  /** Catalog item ID to download */
  itemId: string
  /** Display name for the item (used in tooltip) */
  itemName: string
  /** Button size variant */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Format bytes into human-readable size string
 *
 * @param bytes - Number of bytes to format
 * @returns Formatted string with appropriate unit (B, KB, MB)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Catalog item download button
 *
 * Downloads a catalog item's files as a ZIP archive. Shows
 * file count and size info, handles loading and error states.
 */
export function DownloadButton({ itemId, itemName, size = 'md' }: DownloadButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<{ fileCount: number; estimatedSize: number } | null>(null)

  // Fetch file info on mount
  useEffect(() => {
    let cancelled = false

    const fetchInfo = async () => {
      try {
        const response = await fetch(`/api/catalog/${itemId}/download`, {
          method: 'HEAD',
        })

        if (!cancelled && response.ok) {
          const fileCount = parseInt(response.headers.get('X-File-Count') || '0', 10)
          const estimatedSize = parseInt(response.headers.get('X-Estimated-Size') || '0', 10)
          setFileInfo({ fileCount, estimatedSize })
        }
      } catch {
        // Silently fail - info is optional
      }
    }

    fetchInfo()

    return () => {
      cancelled = true
    }
  }, [itemId])

  const handleDownload = useCallback(async () => {
    if (isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/catalog/${itemId}/download`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Download failed')
      }

      // Get the blob and trigger download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `${itemId}.zip`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      setError(message)

      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000)
    } finally {
      setIsLoading(false)
    }
  }, [itemId, isLoading])

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
  }

  const iconSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }

  const infoText = fileInfo && !isLoading && !error
    ? `${fileInfo.fileCount} files (${formatBytes(fileInfo.estimatedSize)})`
    : null

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={handleDownload}
        disabled={isLoading}
        className={`inline-flex items-center ${sizeClasses[size]} rounded-lg font-medium transition-all duration-200 ${
          isLoading
            ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-wait'
            : error
            ? 'bg-red-500/20 text-red-400'
            : 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20'
        }`}
        title={`Download ${itemName} as ZIP`}
      >
        <span className={iconSizes[size]}>
          {isLoading ? (
            <span className="inline-block animate-spin">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </span>
          ) : error ? (
            '!'
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </span>
        <span>
          {isLoading ? '...' : error ? 'Error' : 'ZIP'}
          {infoText && <span className="text-[var(--text-muted)] ml-1 font-normal">{infoText}</span>}
        </span>
      </button>
    </div>
  )
}
