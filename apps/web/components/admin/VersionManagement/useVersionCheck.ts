/**
 * Version check hook
 *
 * Provides version checking functionality with loading state,
 * error handling, and update availability detection.
 */
'use client'

import { useState, useCallback } from 'react'
import type { UpdateCheckResult } from '@/lib/plugin/updates'
import type { UseVersionCheckOptions } from './types'

/**
 * Hook for version check functionality
 */
export function useVersionCheck(options: UseVersionCheckOptions = {}) {
  const { autoCheck: _autoCheck = false, checkInterval: _checkInterval = 3600000 } = options // 1 hour default

  const [isChecking, setIsChecking] = useState(false)
  const [lastResult, setLastResult] = useState<UpdateCheckResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true)
    setError(null)

    try {
      // This would typically call an API endpoint
      const response = await fetch('/api/updates/check')
      const result = await response.json()
      setLastResult(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to check for updates'))
    } finally {
      setIsChecking(false)
    }
  }, [])

  return {
    isChecking,
    lastResult,
    error,
    checkForUpdates,
    hasUpdates: lastResult?.hasUpdates ?? false,
    updateCount: lastResult?.updates.length ?? 0,
  }
}
