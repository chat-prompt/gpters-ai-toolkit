'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface WelfareEngineMetrics {
  accumulation: {
    totalSkills: number
    newSkills: number
    totalUpdates: number
    newUpdates: number
  }
  utilization: {
    totalViews: number
    totalSearches: number
    topSkills: Array<{ id: string; name: string; views: number }>
  }
  quality: {
    successRate: number
    avgResponseTime: number
  }
  secondary: {
    contributors: Array<{ name: string; skillCount: number }>
  }
}

interface SkillRanking {
  id: string
  name: string
  type: string
  views: number
  authorName?: string
}

interface Contributor {
  name: string
  skillCount: number
}

interface StatsResponse {
  period: string
  startDate: string
  endDate: string
  metrics: WelfareEngineMetrics
  rankings: {
    skills: SkillRanking[]
    contributors: Contributor[]
  }
}

type _WeeklyReportResponse = {
  weekStart: string
  current: WelfareEngineMetrics
  previous: WelfareEngineMetrics
  changes: {
    skills: number
    updates: number
    views: number
    searches: number
  }
}

type Period = '7d' | '30d' | '90d'

export function WelfareEngineDashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<StatsResponse | null>(null)
  const [weeklyReport, setWeeklyReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/welfare-engine/stats?period=${period}`)
      if (!response.ok) throw new Error('Failed to fetch stats')
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [period])

  const fetchWeeklyReport = useCallback(async () => {
    try {
      const response = await fetch('/api/welfare-engine/stats?weeklyReport=true&format=text')
      if (!response.ok) throw new Error('Failed to fetch weekly report')
      const text = await response.text()
      setWeeklyReport(text)
    } catch (err) {
      console.error('Failed to fetch weekly report:', err)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchWeeklyReport()
  }, [fetchStats, fetchWeeklyReport])

  const copyReport = useCallback(() => {
    if (weeklyReport) {
      navigator.clipboard.writeText(weeklyReport)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [weeklyReport])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F26522]" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">Failed to load statistics: {error}</p>
        <button
          onClick={fetchStats}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  const { metrics, rankings } = data

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-[#F26522] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-[var(--bg-secondary)] text-[var(--text-secondary)] rounded-lg text-sm hover:bg-[var(--bg-tertiary)]"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="등록된 스킬"
          value={metrics.accumulation.totalSkills}
          change={metrics.accumulation.newSkills}
          icon="📚"
        />
        <MetricCard
          title="업데이트"
          value={metrics.accumulation.totalUpdates}
          change={metrics.accumulation.newUpdates}
          icon="🔄"
        />
        <MetricCard
          title="스킬 조회"
          value={metrics.utilization.totalViews}
          icon="👁️"
        />
        <MetricCard
          title="검색"
          value={metrics.utilization.totalSearches}
          icon="🔍"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            품질 지표
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-[var(--text-secondary)]">성공률</span>
                <span className="text-2xl font-bold text-[#10B981]">
                  {metrics.quality.successRate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
                <div
                  className="bg-[#10B981] h-2 rounded-full transition-all"
                  style={{ width: `${metrics.quality.successRate}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">평균 응답시간</span>
                <span className="text-2xl font-bold text-[#3B82F6]">
                  {metrics.quality.avgResponseTime}ms
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            TOP 3 스킬
          </h3>
          <div className="space-y-3">
            {metrics.utilization.topSkills.slice(0, 3).map((skill, idx) => (
              <div key={skill.id} className="flex items-center gap-3">
                <span className="text-2xl">{['🥇', '🥈', '🥉'][idx]}</span>
                <div className="flex-1">
                  <Link
                    href={`/detail/${skill.id}`}
                    className="text-[var(--text-primary)] hover:text-[#F26522] font-medium"
                  >
                    {skill.name}
                  </Link>
                  <p className="text-xs text-[var(--text-muted)]">{skill.views} views</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            스킬 조회 순위
          </h3>
          <div className="space-y-2">
            {rankings.skills.slice(0, 10).map((skill, idx) => (
              <div
                key={skill.id}
                className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-[var(--text-muted)] w-6">
                    #{idx + 1}
                  </span>
                  <div>
                    <Link
                      href={`/detail/${skill.id}`}
                      className="text-[var(--text-primary)] hover:text-[#F26522]"
                    >
                      {skill.name}
                    </Link>
                    {skill.authorName && (
                      <p className="text-xs text-[var(--text-muted)]">by {skill.authorName}</p>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {skill.views}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            배포자 목록
          </h3>
          <div className="space-y-2">
            {rankings.contributors.slice(0, 10).map((contributor, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-[var(--text-muted)] w-6">
                    #{idx + 1}
                  </span>
                  <span className="text-[var(--text-primary)]">{contributor.name}</span>
                </div>
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {contributor.skillCount}개
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {weeklyReport && (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              주간 리포트
            </h3>
            <button
              onClick={copyReport}
              className="px-4 py-2 bg-[#F26522] text-white rounded-lg text-sm hover:bg-[#D95A1E] transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy Report'}
            </button>
          </div>
          <pre className="text-sm text-[var(--text-primary)] font-mono whitespace-pre-wrap bg-[var(--bg-tertiary)] p-4 rounded-lg">
            {weeklyReport}
          </pre>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  title,
  value,
  change,
  icon,
}: {
  title: string
  value: number
  change?: number
  icon: string
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-secondary)]">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-[var(--text-primary)]">
          {value.toLocaleString()}
        </span>
        {change !== undefined && (
          <span
            className={`text-sm font-medium ${
              change > 0 ? 'text-[#10B981]' : change < 0 ? 'text-[#EF4444]' : 'text-[var(--text-muted)]'
            }`}
          >
            {change > 0 ? '+' : ''}
            {change}
          </span>
        )}
      </div>
    </div>
  )
}
