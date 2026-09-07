'use client'

/**
 * 개별 승인 외부 계정 패널
 *
 * gpters.org 도메인 밖의 계정을 슈퍼 어드민이 직접 승인하거나 취소한다.
 * 변경은 배포 없이 바로 로그인 정책에 반영된다.
 */

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'

/** 승인된 외부 계정 한 건 */
interface AllowedAccount {
  /** 승인된 이메일 주소 */
  email: string
  /** 승인 사유 메모 */
  note: string | null
  /** 승인 시각 */
  createdAt: string | null
  /** 승인한 사람의 이메일 */
  addedByEmail: string | null
}

const inputClass =
  'px-3 py-2 rounded-lg text-sm border border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]'

/**
 * 승인 외부 계정 목록과 추가·취소 폼
 *
 * 슈퍼 어드민에게만 렌더링하며, 권한이 없으면 API가 다시 한 번 막는다.
 */
export function AllowedAccountsPanel() {
  const toast = useToast()
  const { confirm: confirmDialog } = useConfirmDialog()
  const [accounts, setAccounts] = useState<AllowedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/allowed-accounts')
      if (!res.ok) throw new Error('승인 계정을 불러오지 못했습니다.')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '승인 계정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
    // toast는 렌더마다 새로 만들어지므로 의존성에서 제외한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/allowed-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note: note || undefined }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '승인에 실패했습니다.')

      setEmail('')
      setNote('')
      toast.success(`${data.account.email} 계정을 승인했습니다.`)
      await fetchAccounts()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '승인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(target: string) {
    const confirmed = await confirmDialog({
      title: '승인 취소',
      description: `"${target}" 계정의 접근을 지금 끊습니다. 로그인 세션과 CLI/MCP 토큰도 바로 막힙니다.`,
      variant: 'danger',
      confirmLabel: '취소하기',
    })
    if (!confirmed) return

    setRevokingEmail(target)
    try {
      const res = await fetch(`/api/admin/allowed-accounts?email=${encodeURIComponent(target)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '승인 취소에 실패했습니다.')
      }

      setAccounts(accounts.filter(account => account.email !== target))
      toast.success(`${target} 계정의 승인을 취소했습니다.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '승인 취소에 실패했습니다.')
    } finally {
      setRevokingEmail(null)
    }
  }

  function formatDate(value: string | null): string {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-3">External Access</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        gpters.org 계정이 아닌 사람을 한 명씩 승인합니다. 추가하면 바로 로그인할 수 있고,
        승인을 취소하면 로그인 세션과 CLI/MCP 토큰이 즉시 막힙니다.
      </p>

      <form onSubmit={handleAdd} className="mb-4 p-4 rounded-lg bg-[var(--bg-tertiary)]">
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={`flex-1 min-w-[220px] ${inputClass}`}
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모 (선택)"
            className={`flex-1 min-w-[160px] ${inputClass}`}
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >
            {submitting ? '승인 중...' : '승인 추가'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">승인된 외부 계정이 없습니다.</p>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
          {accounts.map((account) => (
            <div key={account.email} className="flex flex-wrap items-center gap-3 py-2.5">
              <code className="font-mono text-xs text-[var(--text-secondary)] flex-1 min-w-[200px]">
                {account.email}
              </code>
              {account.note && (
                <span className="text-xs text-[var(--text-muted)]">{account.note}</span>
              )}
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {formatDate(account.createdAt)}
                {account.addedByEmail ? ` · ${account.addedByEmail}` : ''}
              </span>
              <button
                onClick={() => handleRevoke(account.email)}
                disabled={revokingEmail === account.email}
                className="text-sm text-[var(--accent-orange)] hover:opacity-80 disabled:opacity-50"
              >
                {revokingEmail === account.email ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
