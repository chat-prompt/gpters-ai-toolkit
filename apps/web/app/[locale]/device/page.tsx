/**
 * Device Authorization Page
 *
 * 사용자가 `aitk login --device`에서 표시된 코드를 입력하여
 * 헤드리스 환경의 CLI를 인증합니다.
 */
'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'

/** 페이지 상태 */
type PageState = 'idle' | 'loading' | 'success' | 'denied' | 'error'

export default function DevicePage() {
  const [code, setCode] = useState('')
  const [state, setState] = useState<PageState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('profile')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /**
   * 입력값을 XXXX-XXXX 형식으로 포맷팅
   */
  function handleCodeChange(value: string) {
    // 영숫자만 추출하여 대문자 변환
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    // 8자 제한, 4자 후 하이픈 삽입
    const limited = cleaned.slice(0, 8)
    if (limited.length > 4) {
      setCode(`${limited.slice(0, 4)}-${limited.slice(4)}`)
    } else {
      setCode(limited)
    }
  }

  /**
   * 승인/거부 요청 전송
   */
  async function handleAction(action: 'approve' | 'deny') {
    if (code.replace(/-/g, '').length !== 8) return

    setState('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: code, action }),
      })

      if (res.ok) {
        setState(action === 'approve' ? 'success' : 'denied')
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        setErrorMsg(data.error || t('device.invalidCode'))
        setState('error')
      }
    } catch {
      setErrorMsg('Network error. Please try again.')
      setState('error')
    }
  }

  const codeComplete = code.replace(/-/g, '').length === 8

  return (
    <div className="page-shell items-center justify-center px-4">
      <div className="surface-card max-w-md w-full text-center">
        {/* Header */}
        <div className="mb-8">
          <h1 className="page-title">{t('device.title')}</h1>
          <p className="page-subtitle mx-auto">{t('device.description')}</p>
        </div>

        {state === 'success' ? (
          <div className="py-8">
            <p className="eyebrow">{t('device.success')}</p>
          </div>
        ) : state === 'denied' ? (
          <div className="py-8">
            <p className="text-sm text-[var(--text-secondary)]">{t('device.denied')}</p>
          </div>
        ) : (
          <>
            {/* Code input */}
            <div className="mb-6 text-left">
              <label htmlFor="device-code" className="block text-sm text-[var(--text-muted)] mb-2">
                {t('device.codeLabel')}
              </label>
              <input
                ref={inputRef}
                id="device-code"
                type="text"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && codeComplete && state !== 'loading') {
                    handleAction('approve')
                  }
                }}
                placeholder={t('device.codePlaceholder')}
                className="w-full text-center text-3xl font-mono tracking-[0.3em] px-4 py-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:tracking-[0.1em] placeholder:text-xl focus:outline-none focus:border-[var(--border-hover)]"
                maxLength={9}
                autoComplete="off"
                spellCheck={false}
                disabled={state === 'loading'}
              />
            </div>

            {/* Error message */}
            {state === 'error' && errorMsg && (
              <div className="mb-4 p-3 rounded-lg border border-[var(--border-hover)] text-[var(--text-secondary)] text-sm">
                {errorMsg}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => handleAction('deny')}
                disabled={!codeComplete || state === 'loading'}
                className="flex-1 py-3 px-4 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {t('device.deny')}
              </button>
              <button
                onClick={() => handleAction('approve')}
                disabled={!codeComplete || state === 'loading'}
                className="flex-[2] py-3 px-4 rounded-xl bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity text-sm"
              >
                {state === 'loading' ? '...' : t('device.verify')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
