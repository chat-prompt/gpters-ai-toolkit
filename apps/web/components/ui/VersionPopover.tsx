'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface VersionEntry {
  id: string
  version: string
  versionType: 'major' | 'minor' | 'patch'
  changelog?: string
  createdAt: string
}

interface VersionPopoverProps {
  version: string
  itemId: string
  size?: 'sm' | 'md'
}

export function VersionPopover({ version, itemId, size = 'sm' }: VersionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const fetchVersions = useCallback(async () => {
    if (fetched) return

    setLoading(true)
    try {
      const response = await fetch(`/api/versions/${itemId}?limit=5`)
      if (response.ok) {
        const data = await response.json()
        setVersions(data.versions || [])
      }
    } catch {
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }, [itemId, fetched])

  const handleClick = () => {
    setIsOpen(!isOpen)
    if (!isOpen && !fetched) {
      fetchVersions()
    }
  }

  const sizeClasses = size === 'md'
    ? 'text-xs px-3 py-1.5'
    : 'text-[10px] px-2 py-1'

  const versionTypeColors = {
    major: 'text-red-400',
    minor: 'text-yellow-400',
    patch: 'text-green-400',
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleClick}
        className={`${sizeClasses} rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] font-mono hover:bg-[var(--accent-cyan)]/20 transition-colors cursor-pointer`}
        aria-label={`Version ${version} - click for history`}
      >
        v{version}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 rounded-xl overflow-hidden shadow-xl z-[1001] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Version History
            </h3>
          </div>

          <div className="p-3 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <span className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-[var(--text-muted)]">Initial release</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">v{version}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`p-2 rounded-lg ${index === 0 ? 'bg-[var(--accent-cyan)]/5' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-medium ${index === 0 ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-primary)]'}`}>
                        v{entry.version}
                      </span>
                      <span className={`text-[10px] ${versionTypeColors[entry.versionType]}`}>
                        {entry.versionType}
                      </span>
                      {index === 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
                          current
                        </span>
                      )}
                    </div>
                    {entry.changelog && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">
                        {entry.changelog}
                      </p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      {new Date(entry.createdAt).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
