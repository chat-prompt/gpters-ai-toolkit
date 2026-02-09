'use client'

/**
 * Organization switcher dropdown component
 *
 * Allows users to switch between their organizations with a dropdown interface.
 * Fetches organization names from the API and displays them in a clean dropdown.
 */

import { useState, useRef, useEffect } from 'react'
import { useOrgContext } from '@/lib/hooks/useOrgContext'

/**
 * Organization data structure from API
 */
interface Organization {
  id: string
  name: string
  slug: string
}

/**
 * Organization switcher component
 *
 * Features:
 * - Displays current organization name
 * - Dropdown with all user's organizations
 * - Highlights currently active org
 * - Loading state during switch
 * - Disabled state for single-org users
 * - Click outside to close
 *
 * @example
 * ```tsx
 * <OrgSwitcher />
 * ```
 */
export function OrgSwitcher() {
  const { currentOrgId, orgIds, switchOrg, isLoading: isSwitching } = useOrgContext()
  const [isOpen, setIsOpen] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const response = await fetch('/api/organizations')
        if (!response.ok) throw new Error('Failed to fetch organizations')
        const data = await response.json()
        setOrganizations(data.organizations || [])
      } catch (error) {
        console.error('Failed to load organizations:', error)
      } finally {
        setIsLoadingOrgs(false)
      }
    }

    fetchOrganizations()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!orgIds || orgIds.length === 0) {
    return null
  }

  const currentOrg = organizations.find(org => org.id === currentOrgId)
  const hasMultipleOrgs = orgIds.length > 1
  const isDisabled = !hasMultipleOrgs || isLoadingOrgs || isSwitching

  const handleOrgSwitch = async (orgId: string) => {
    if (orgId === currentOrgId) {
      setIsOpen(false)
      return
    }
    await switchOrg(orgId)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => !isDisabled && setIsOpen(!isOpen)}
        disabled={isDisabled}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
          transition-all
          ${
            isDisabled
              ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed'
              : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
          }
        `}
        aria-label="Switch organization"
        aria-expanded={isOpen}
      >
        {/* Organization Icon */}
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>

        {/* Organization Name */}
        <span className="whitespace-nowrap">
          {isLoadingOrgs ? 'Loading...' : currentOrg?.name || 'Select Org'}
        </span>

        {/* Chevron Icon (only if multiple orgs) */}
        {hasMultipleOrgs && !isLoadingOrgs && (
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}

        {/* Loading Spinner */}
        {isSwitching && (
          <svg
            className="animate-spin w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && hasMultipleOrgs && !isLoadingOrgs && (
        <div
          className="
            absolute top-full right-0 mt-2 w-64
            bg-[var(--bg-secondary)] border border-[var(--border-subtle)]
            rounded-xl shadow-lg
            overflow-hidden
            z-[1020]
            animate-in fade-in slide-in-from-top-2 duration-200
          "
        >
          <div className="py-2">
            {organizations.map(org => {
              const isActive = org.id === currentOrgId
              return (
                <button
                  key={org.id}
                  onClick={() => handleOrgSwitch(org.id)}
                  disabled={isSwitching}
                  className={`
                    w-full px-4 py-2.5 text-left text-sm
                    transition-colors
                    ${
                      isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                    }
                    ${isSwitching ? 'cursor-not-allowed opacity-50' : ''}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{org.name}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">{org.slug}</div>
                    </div>
                    {isActive && (
                      <svg
                        className="w-4 h-4 flex-shrink-0 ml-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
