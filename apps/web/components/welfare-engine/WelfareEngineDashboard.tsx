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
    topSkills: Array<{ id: string; name: string; type: string; views: number }>
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

interface WeeklyTrendData {
  weekStart: string
  weekEnd: string
  weekLabel: string
  newSkills: number
  newUpdates: number
  views: number
  searches: number
  successRate: number
}

type Period = '7d' | '30d' | '90d'

export function WelfareEngineDashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<StatsResponse | null>(null)
  const [weeklyReport, setWeeklyReport] = useState<string | null>(null)
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyTrendData[]>([])
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

  const fetchWeeklyTrend = useCallback(async () => {
    try {
      const response = await fetch('/api/welfare-engine/stats?weeklyTrend=true&numWeeks=8')
      if (!response.ok) throw new Error('Failed to fetch weekly trend')
      const result = await response.json()
      setWeeklyTrend(result.weeks || [])
    } catch (err) {
      console.error('Failed to fetch weekly trend:', err)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchWeeklyReport()
    fetchWeeklyTrend()
  }, [fetchStats, fetchWeeklyReport, fetchWeeklyTrend])

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-primary)]" />
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
                  ? 'bg-[var(--brand-primary)] text-white'
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
                    href={`/${skill.type === 'guide' ? 'guides' : skill.type}/${skill.id}`}
                    className="text-[var(--text-primary)] hover:text-[var(--brand-primary)] font-medium"
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
                      href={`/${skill.type === 'guide' ? 'guides' : skill.type}/${skill.id}`}
                      className="text-[var(--text-primary)] hover:text-[var(--brand-primary)]"
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

      {weeklyTrend.length > 0 && (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            📈 주간별 트렌드
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left py-3 px-2 text-[var(--text-muted)] font-medium">주차</th>
                  <th className="text-right py-3 px-2 text-[var(--text-muted)] font-medium">신규 스킬</th>
                  <th className="text-right py-3 px-2 text-[var(--text-muted)] font-medium">업데이트</th>
                  <th className="text-right py-3 px-2 text-[var(--text-muted)] font-medium">조회수</th>
                  <th className="text-right py-3 px-2 text-[var(--text-muted)] font-medium">검색</th>
                  <th className="text-right py-3 px-2 text-[var(--text-muted)] font-medium">성공률</th>
                </tr>
              </thead>
              <tbody>
                {weeklyTrend.map((week, idx) => (
                  <tr 
                    key={week.weekStart} 
                    className={`border-b border-[var(--border-subtle)] last:border-0 ${idx === 0 ? 'bg-[var(--brand-primary)]/5' : ''}`}
                  >
                    <td className="py-3 px-2 text-[var(--text-primary)]">
                      {idx === 0 && <span className="text-[var(--brand-primary)] mr-1">●</span>}
                      {week.weekLabel}
                    </td>
                    <td className="text-right py-3 px-2 text-[var(--text-primary)] font-medium">
                      {week.newSkills > 0 ? `+${week.newSkills}` : week.newSkills}
                    </td>
                    <td className="text-right py-3 px-2 text-[var(--text-secondary)]">
                      {week.newUpdates}
                    </td>
                    <td className="text-right py-3 px-2 text-[var(--text-secondary)]">
                      {week.views.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-2 text-[var(--text-secondary)]">
                      {week.searches.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-2">
                      <span className={week.successRate >= 95 ? 'text-[#10B981]' : week.successRate >= 90 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}>
                        {week.successRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {weeklyReport && (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              주간 리포트
            </h3>
            <button
              onClick={copyReport}
              className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg text-sm hover:bg-[var(--brand-primary)] transition-colors"
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
