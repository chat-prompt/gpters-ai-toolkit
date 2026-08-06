'use client'

/**
 * Welfare Engine Dashboard component
 *
 * Displays skill accumulation, utilization, and quality metrics
 * for the AI Toolkit welfare engine, including weekly trends and rankings.
 *
 * AX 대시보드와 같은 조판 언어를 쓴다 — 핵심 수치는 세로 구분선으로 나눈 한 줄,
 * 목록·표는 divide-y, 숫자는 font-mono tabular-nums.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

/** Welfare engine metrics data structure */
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

/** Skill ranking entry */
interface SkillRanking {
  id: string
  name: string
  type: string
  views: number
  authorName?: string
}

/** Contributor entry */
interface Contributor {
  name: string
  skillCount: number
}

/** Stats API response */
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

/** Weekly trend data point */
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

/** 기간 탭 옵션 — API가 받는 값과 화면 라벨을 함께 들고 있는다 */
const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
]

/** 표 머리칸 공통 스타일 — AX 패널의 TH 규격과 같다 */
const TH = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-normal'

/** 표 본문칸 공통 여백 */
const TD = 'py-2.5 px-2'

/**
 * Welfare Engine Dashboard
 *
 * Shows period-filtered stats, quality metrics, skill rankings,
 * contributor list, weekly trend table, and weekly report.
 */
export function WelfareEngineDashboard() {
  const t = useTranslations('stats.dashboard')

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
    return <DashboardSkeleton />
  }

  if (error || !data) {
    return (
      <div className="surface-card flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--text-primary)]">
          데이터를 불러오지 못했습니다{error ? ` — ${error}` : ''}
        </p>
        <button
          onClick={fetchStats}
          className="font-mono text-xs px-3 py-1.5 rounded-full border border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors active:translate-y-px"
        >
          다시 시도
        </button>
      </div>
    )
  }

  const { metrics, rankings } = data

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <PeriodControl value={period} onChange={setPeriod} />
        <button
          onClick={fetchStats}
          className="font-mono text-xs px-3 py-1.5 rounded-full border border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors active:translate-y-px"
        >
          Refresh
        </button>
      </div>

      <MetricsBand
        items={[
          {
            label: t('registeredSkills'),
            value: metrics.accumulation.totalSkills,
            change: metrics.accumulation.newSkills,
          },
          {
            label: t('updates'),
            value: metrics.accumulation.totalUpdates,
            change: metrics.accumulation.newUpdates,
          },
          { label: t('skillViews'), value: metrics.utilization.totalViews },
          { label: t('searches'), value: metrics.utilization.totalSearches },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <QualityCard
          title={t('qualityMetrics')}
          successLabel={t('successRate')}
          avgLabel={t('avgResponseTime')}
          successRate={metrics.quality.successRate}
          avgResponseTime={metrics.quality.avgResponseTime}
        />
        <TopSkillsCard title={t('top3Skills')} skills={metrics.utilization.topSkills} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <RankingCard title={t('skillRanking')} skills={rankings.skills} />
        <ContributorsCard
          title={t('contributors')}
          contributors={rankings.contributors}
          formatCount={(n) => t('count', { n })}
        />
      </div>

      {weeklyTrend.length > 0 && (
        <WeeklyTrendCard title={t('weeklyTrend')} trend={weeklyTrend} t={t} />
      )}

      {weeklyReport && (
        <WeeklyReportCard
          title={t('weeklyReport')}
          report={weeklyReport}
          copied={copied}
          onCopy={copyReport}
        />
      )}
    </div>
  )
}

/**
 * 기간 선택 — 알약 하나가 현재 값을 따라 움직이는 세그먼트 컨트롤 (AX 대시보드와 같은 규격)
 *
 * @param value - 현재 선택된 기간
 * @param onChange - 기간 변경 핸들러
 */
function PeriodControl({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
      role="group"
      aria-label="조회 기간"
    >
      {PERIOD_OPTIONS.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`px-4 py-1.5 rounded-full font-mono text-xs tabular-nums transition-all duration-200 active:scale-[0.97] ${
              active
                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** 밴드 한 칸에 실리는 지표 */
interface MetricsBandItem {
  /** 지표 이름 */
  label: string
  /** 주 수치 */
  value: number
  /** 기간 내 증감 — 없으면 표시하지 않는다 */
  change?: number
}

/**
 * 핵심 지표 밴드 — 상자 대신 얇은 선으로 나눈 한 줄에 모은다 (AX HighlightBand와 같은 규격)
 *
 * @param items - 표시할 지표 목록 (최대 4개)
 */
function MetricsBand({ items }: { items: MetricsBandItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
      {items.map((item) => (
        <div key={item.label} className="bg-[var(--bg-primary)] px-6 py-7">
          <p className="eyebrow">{item.label}</p>
          <p className="mt-2.5 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl md:text-[2.5rem] leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
              {item.value.toLocaleString('ko-KR')}
            </span>
            {item.change !== undefined && (
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {item.change > 0 ? '+' : ''}
                {item.change.toLocaleString('ko-KR')}
              </span>
            )}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * 품질 지표 카드 — 성공률 바와 평균 응답시간
 *
 * @param title - 카드 제목
 * @param successLabel - 성공률 라벨
 * @param avgLabel - 평균 응답시간 라벨
 * @param successRate - 성공률(%)
 * @param avgResponseTime - 평균 응답시간(ms)
 */
function QualityCard({
  title,
  successLabel,
  avgLabel,
  successRate,
  avgResponseTime,
}: {
  title: string
  successLabel: string
  avgLabel: string
  successRate: number
  avgResponseTime: number
}) {
  return (
    <div className="surface-card">
      <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-6">{title}</h3>
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="eyebrow">{successLabel}</span>
            <span className="font-mono text-2xl tabular-nums text-[var(--text-primary)]">
              {successRate.toFixed(1)}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, successRate))}%` }}
            />
          </div>
        </div>
        <div className="flex items-baseline justify-between pt-4 border-t border-[var(--border-subtle)]">
          <span className="eyebrow">{avgLabel}</span>
          <span className="font-mono text-2xl tabular-nums text-[var(--text-primary)]">{avgResponseTime}ms</span>
        </div>
      </div>
    </div>
  )
}

/**
 * TOP 3 스킬 카드 — 순위 숫자 + 이름 + 조회수
 *
 * @param title - 카드 제목
 * @param skills - 조회수 상위 스킬 목록
 */
function TopSkillsCard({
  title,
  skills,
}: {
  title: string
  skills: Array<{ id: string; name: string; type: string; views: number }>
}) {
  const top = skills.slice(0, 3)

  return (
    <div className="surface-card">
      <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">{title}</h3>
      {top.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">표시할 데이터가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
          {top.map((skill, idx) => (
            <li key={skill.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                  {idx + 1}
                </span>
                <Link
                  href={`/${skill.type === 'guide' ? 'guides' : skill.type}/${skill.id}`}
                  className="truncate text-sm text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors"
                >
                  {skill.name}
                </Link>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                {skill.views.toLocaleString('ko-KR')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 스킬 조회 순위 카드 — 상위 10개
 *
 * @param title - 카드 제목
 * @param skills - 순위가 매겨진 스킬 목록
 */
function RankingCard({ title, skills }: { title: string; skills: SkillRanking[] }) {
  const ranked = skills.slice(0, 10)

  return (
    <div className="surface-card">
      <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">{title}</h3>
      {ranked.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">표시할 데이터가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
          {ranked.map((skill, idx) => (
            <li key={skill.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/${skill.type === 'guide' ? 'guides' : skill.type}/${skill.id}`}
                    className="block truncate text-sm text-[var(--text-primary)] hover:text-[var(--brand-primary)] transition-colors"
                  >
                    {skill.name}
                  </Link>
                  {skill.authorName && (
                    <p className="text-xs text-[var(--text-muted)]">{skill.authorName}</p>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                {skill.views.toLocaleString('ko-KR')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 배포자 목록 카드
 *
 * @param title - 카드 제목
 * @param contributors - 배포자 목록
 * @param formatCount - 스킬 개수 표기 포매터 (예: 3 → "3개")
 */
function ContributorsCard({
  title,
  contributors,
  formatCount,
}: {
  title: string
  contributors: Contributor[]
  formatCount: (n: number) => string
}) {
  const top = contributors.slice(0, 10)

  return (
    <div className="surface-card">
      <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">{title}</h3>
      {top.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">표시할 데이터가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
          {top.map((contributor, idx) => (
            <li key={contributor.name} className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                  {idx + 1}
                </span>
                <span className="truncate text-sm text-[var(--text-primary)]">{contributor.name}</span>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                {formatCount(contributor.skillCount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 다국어 번역 함수 타입 — 주간 트렌드 표의 컬럼 헤더에만 쓴다 */
type Translator = (key: string) => string

/**
 * 주간별 트렌드 표
 *
 * @param title - 카드 제목
 * @param trend - 주차별 지표 목록
 * @param t - 컬럼 헤더 번역 함수
 */
function WeeklyTrendCard({ title, trend, t }: { title: string; trend: WeeklyTrendData[]; t: Translator }) {
  return (
    <div className="surface-card">
      <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH}`}>{t('weekCol')}</th>
              <th className={`text-right ${TD} ${TH}`}>{t('newSkillsCol')}</th>
              <th className={`text-right ${TD} ${TH}`}>{t('updatesCol')}</th>
              <th className={`text-right ${TD} ${TH}`}>{t('viewsCol')}</th>
              <th className={`text-right ${TD} ${TH}`}>{t('searchesCol')}</th>
              <th className={`text-right ${TD} ${TH}`}>{t('successRateCol')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {trend.map((week, idx) => (
              <tr key={week.weekStart} className="transition-colors duration-200 hover:bg-[var(--bg-tertiary)]/40">
                <td className={`${TD} text-[var(--text-primary)]`}>
                  <span className="inline-flex items-center gap-2">
                    {idx === 0 && <span className="size-1.5 rounded-full bg-[var(--text-primary)]" />}
                    {week.weekLabel}
                  </span>
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-primary)]`}>
                  {week.newSkills > 0 ? `+${week.newSkills}` : week.newSkills}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {week.newUpdates}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {week.views.toLocaleString('ko-KR')}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {week.searches.toLocaleString('ko-KR')}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-primary)]`}>
                  {week.successRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 주간 리포트 카드 — 텍스트 리포트를 그대로 보여주고 복사할 수 있다
 *
 * @param title - 카드 제목
 * @param report - 리포트 본문 텍스트
 * @param copied - 방금 복사했는지 여부
 * @param onCopy - 복사 버튼 핸들러
 */
function WeeklyReportCard({
  title,
  report,
  copied,
  onCopy,
}: {
  title: string
  report: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="surface-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium tracking-tight text-[var(--text-primary)]">{title}</h3>
        <button
          onClick={onCopy}
          className="font-mono text-xs px-3 py-1.5 rounded-full border border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors active:translate-y-px"
        >
          {copied ? 'Copied' : 'Copy Report'}
        </button>
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-4 rounded-xl overflow-x-auto">
        {report}
      </pre>
    </div>
  )
}

/**
 * 로딩 자리표시자 — 실제 배치와 비슷한 모양으로 둔다
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
        {[0, 1, 2, 3].map((slot) => (
          <div key={slot} className="bg-[var(--bg-primary)] px-6 py-7">
            <div className="shimmer h-3 w-16 rounded" />
            <div className="shimmer mt-3 h-9 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[0, 1].map((slot) => (
          <div key={slot} className="surface-card space-y-3">
            <div className="shimmer h-5 w-32 rounded" />
            <div className="shimmer h-24 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
