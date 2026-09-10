'use client'

import { useEffect, useRef, useState } from 'react'

export const AX_REFRESH_INTERVAL_MS = 60_000

/** Refresh visible data only; resume immediately after visibility/network recovery. */
export function useAxAutoRefresh(refresh: () => void) {
  const refreshRef = useRef(refresh)
  const [environment, setEnvironment] = useState({ hidden: false, offline: false })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => { refreshRef.current = refresh }, [refresh])
  useEffect(() => {
    let lastTick = Date.now()
    let disposed = false
    const available = () => document.visibilityState !== 'hidden' && navigator.onLine !== false
    const update = () => {
      setEnvironment({ hidden: document.visibilityState === 'hidden', offline: navigator.onLine === false })
      setNow(Date.now())
    }
    const resume = () => {
      update()
      if (available()) {
        lastTick = Date.now()
        refreshRef.current()
      }
    }
    // Read browser state after hydration without issuing a second initial request.
    queueMicrotask(() => { if (!disposed) update() })
    const timer = setInterval(() => {
      if (!available()) return
      update()
      if (Date.now() - lastTick >= AX_REFRESH_INTERVAL_MS) {
        lastTick = Date.now()
        refreshRef.current()
      }
    }, 15_000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', update)
    return () => {
      disposed = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', update)
    }
  }, [])
  return { ...environment, now }
}
