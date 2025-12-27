'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminAuth } from '@/lib/admin-auth'

interface Stats {
  total: number
  skill: number
  agent: number
  command: number
  guide: number
}

export default function AdminDashboard() {
  const { password } = useAdminAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/catalog', {
          headers: { 'x-admin-password': password || '' },
        })
        const items = await res.json()

        const stats: Stats = {
          total: items.length,
          skill: items.filter((i: { type: string }) => i.type === 'skill').length,
          agent: items.filter((i: { type: string }) => i.type === 'agent').length,
          command: items.filter((i: { type: string }) => i.type === 'command').length,
          guide: items.filter((i: { type: string }) => i.type === 'guide').length,
        }

        setStats(stats)
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [password])

  const statCards = [
    { label: 'Total Items', value: stats?.total || 0, color: 'cyan' },
    { label: 'Skills', value: stats?.skill || 0, color: 'cyan' },
    { label: 'Agents', value: stats?.agent || 0, color: 'purple' },
    { label: 'Commands', value: stats?.command || 0, color: 'rose' },
    { label: 'Guides', value: stats?.guide || 0, color: 'emerald' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-12">
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Dashboard
        </h1>
        <p className="text-[var(--text-secondary)]">
          Manage your catalog items
        </p>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
            {statCards.map((stat) => (
              <div
                key={stat.label}
                className="glass rounded-xl p-6"
              >
                <div className="text-3xl font-light text-[var(--text-primary)] mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-[var(--text-muted)]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Catalog Actions */}
          <div className="glass rounded-2xl p-8 mb-8">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-6">
              Catalog
            </h2>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/admin/catalog"
                className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                View All Items
              </Link>
              <Link
                href="/admin/catalog/new"
                className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
              >
                Create New Item
              </Link>
            </div>
          </div>

          {/* Data Management */}
          <div className="glass rounded-2xl p-8">
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-6">
              Data Management
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/admin/tags"
                className="p-6 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">🏷️</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                  Tags
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Manage catalog item tags
                </p>
              </Link>
              <Link
                href="/admin/authors"
                className="p-6 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">👤</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                  Authors
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Manage content authors
                </p>
              </Link>
              <Link
                href="/admin/mcp-servers"
                className="p-6 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">🔌</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                  MCP Servers
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Manage MCP server definitions
                </p>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
