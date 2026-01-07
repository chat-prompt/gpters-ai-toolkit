/**
 * MCP server status indicator component
 *
 * Displays real-time connection status with the MCP server,
 * including health metrics, database latency, and error states.
 * Features auto-refresh at configurable intervals.
 */
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'

/** MCP server status data from the API */
interface MCPStatusData {
  /** Overall server status */
  status: 'connected' | 'degraded' | 'error'
  /** Server information */
  serverInfo: {
    name: string
    version: string
    description?: string
    toolsCount?: number
  }
  /** Health check details */
  health?: {
    database: 'healthy' | 'degraded' | 'error'
    dbLatency?: number | null
    responseTime?: number
  }
  /** ISO timestamp of last request */
  lastRequest?: string | null
  /** Total request count */
  requestCount?: number
  /** ISO timestamp of this status check */
  timestamp: string
  /** Error message if status check failed */
  error?: string
}

/** Connection status type for UI display */
type ConnectionStatus = 'connected' | 'disconnected' | 'checking'

/** Props for MCPStatus component */
interface MCPStatusProps {
  /** Interval in ms to check status (default: 30 seconds) */
  checkInterval?: number
  /** Whether to auto-check on mount */
  autoCheck?: boolean
}

/**
 * MCP server status indicator with dropdown details
 *
 * Shows connection status dot and expandable panel with
 * server info, health metrics, and troubleshooting links.
 */
export function MCPStatus({
  checkInterval = 30000,
  autoCheck = true,
}: MCPStatusProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [data, setData] = useState<MCPStatusData | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Check MCP status
  const checkStatus = useCallback(async () => {
    setIsLoading(true)

    try {
      const response = await fetch('/api/mcp/status', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result: MCPStatusData = await response.json()
      setData(result)

      // Determine connection status
      if (result.status === 'connected') {
        setStatus('connected')
      } else if (result.status === 'degraded') {
        setStatus('connected') // Still show as connected but with warning in details
      } else {
        setStatus('disconnected')
      }

      setLastChecked(new Date())
    } catch (error) {
      console.error('Failed to check MCP status:', error)
      setStatus('disconnected')
      setData(null)
      setLastChecked(new Date())
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Auto-check on mount and at interval
  useEffect(() => {
    if (!autoCheck) return

    // Initial check
    checkStatus()

    // Set up interval
    const interval = setInterval(checkStatus, checkInterval)
    return () => clearInterval(interval)
  }, [autoCheck, checkInterval, checkStatus])

  // Status colors
  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    checking: 'bg-yellow-500 animate-pulse',
  }

  const statusLabels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    checking: 'Checking...',
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Status indicator button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        aria-label={`MCP Status: ${statusLabels[status]}`}
        title={`MCP Server: ${statusLabels[status]}`}
      >
        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full ${statusColors[status]}`}
          aria-hidden="true"
        />

        {/* MCP label - hidden on mobile */}
        <span className="text-xs font-medium text-[var(--text-muted)] hidden sm:block">
          MCP
        </span>

        {/* Loading spinner */}
        {isLoading && (
          <span className="w-3 h-3 border border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl overflow-hidden shadow-xl z-[1001] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${statusColors[status]}`}
                />
                <h3 className="font-medium text-[var(--text-primary)]">
                  MCP Server
                </h3>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  checkStatus()
                }}
                disabled={isLoading}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors"
                title="Test connection"
              >
                <svg
                  className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {statusLabels[status]}
            </p>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Server Info */}
            {data?.serverInfo && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Server</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    {data.serverInfo.name}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Version</span>
                  <span className="text-[var(--text-secondary)] font-mono">
                    v{data.serverInfo.version}
                  </span>
                </div>
                {data.serverInfo.toolsCount !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Tools</span>
                    <span className="text-[var(--text-secondary)]">
                      {data.serverInfo.toolsCount} available
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Health Details */}
            {data?.health && (
              <>
                <div className="border-t border-[var(--border-subtle)] pt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Database</span>
                    <span
                      className={`font-medium ${
                        data.health.database === 'healthy'
                          ? 'text-green-400'
                          : data.health.database === 'degraded'
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {data.health.database}
                    </span>
                  </div>
                  {data.health.dbLatency !== null && data.health.dbLatency !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">DB Latency</span>
                      <span className="text-[var(--text-secondary)] font-mono">
                        {data.health.dbLatency}ms
                      </span>
                    </div>
                  )}
                  {data.health.responseTime !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Response Time</span>
                      <span className="text-[var(--text-secondary)] font-mono">
                        {data.health.responseTime}ms
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Last Sync Time */}
            {lastChecked && (
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Last checked</span>
                  <span className="text-[var(--text-secondary)]">
                    {lastChecked.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {status === 'disconnected' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs text-red-400">
                  {data?.error || 'Unable to connect to MCP server'}
                </p>
              </div>
            )}

            {/* Degraded Warning */}
            {data?.status === 'degraded' && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-xs text-yellow-400">
                  Server is running but experiencing performance issues
                </p>
              </div>
            )}
          </div>

          {/* Footer with help link */}
          <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
            <div className="flex items-center justify-between">
              <Link
                href="/guides"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Troubleshooting guide
              </Link>
              <Link
                href="/api/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors"
                onClick={() => setIsOpen(false)}
              >
                API docs
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
