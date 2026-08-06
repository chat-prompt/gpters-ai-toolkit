/**
 * Admin create organization page
 *
 * Form for creating new organizations (super_admin only).
 * Includes name, slug (auto-generated), description, and initial domains.
 */
'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useSession } from 'next-auth/react'
import { Link } from '@/i18n/navigation'

/** 폼 입력 공통 클래스 */
const inputClass =
  'w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-colors'

/** 폼 라벨 공통 클래스 */
const labelClass = 'block text-sm font-medium text-[var(--text-secondary)] mb-2'

export default function NewOrganizationPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [domains, setDomains] = useState<string[]>([''])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSuperAdmin = session?.user?.role === 'super_admin'

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value))
    }
  }

  function handleDomainChange(index: number, value: string) {
    const newDomains = [...domains]
    newDomains[index] = value
    setDomains(newDomains)
  }

  function handleAddDomain() {
    setDomains([...domains, ''])
  }

  function handleRemoveDomain(index: number) {
    setDomains(domains.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isSuperAdmin) {
      setError('Only super_admin can create organizations')
      return
    }

    const validDomains = domains.filter(d => d.trim().length > 0)
    if (validDomains.length === 0) {
      setError('At least one domain is required')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description: description || null,
          allowedDomains: validDomains,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to create organization')
      }

      const newOrg = await res.json()
      router.push(`/admin/organizations/${newOrg.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="surface-card rounded-2xl p-8 text-center">
        <h1 className="page-title mb-4">Access Denied</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          Only super_admin can create organizations.
        </p>
        <Link
          href="/admin/organizations"
          className="inline-block px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Back to Organizations
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/admin/organizations"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 inline-block"
        >
          ← Back to Organizations
        </Link>
        <h1 className="page-title">Create Organization</h1>
        <p className="page-subtitle">
          Set up a new organization with initial domains and settings.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="surface-card rounded-2xl p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/30 text-[var(--accent-orange)]">
            {error}
          </div>
        )}

        <div>
          <label className={labelClass}>
            Organization Name <span className="text-[var(--accent-orange)]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            required
            placeholder="GPTers Inc."
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Slug <span className="text-[var(--accent-orange)]">*</span>
          </label>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            required
            placeholder="gpters-inc"
            pattern="[a-z0-9-]+"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Lowercase letters, numbers, and hyphens only. Auto-generated from name.
          </p>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="A brief description of the organization..."
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Allowed Domains <span className="text-[var(--accent-orange)]">*</span>
          </label>
          <div className="space-y-2">
            {domains.map((domain, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={domain}
                  onChange={e => handleDomainChange(index, e.target.value)}
                  placeholder="gpters.org"
                  className={`flex-1 ${inputClass}`}
                />
                {domains.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDomain(index)}
                    className="px-3 py-2 rounded-lg border border-[var(--accent-orange)]/30 text-[var(--accent-orange)] hover:bg-[var(--accent-orange)]/10 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddDomain}
            className="mt-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
          >
            + Add another domain
          </button>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Users with email addresses from these domains can join this organization.
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={creating || !name || !slug}
            className="px-6 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Organization'}
          </button>
          <Link
            href="/admin/organizations"
            className="px-6 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
