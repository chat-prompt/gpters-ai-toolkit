/**
 * Plugin Marketplace Statistics
 *
 * Provides marketplace analytics and statistics:
 * - Download/install counts
 * - Popular plugin rankings
 * - User reviews and ratings
 * - Trend analysis
 */

import { createLogger } from './logger'

const log = createLogger('marketplace-stats')

/**
 * Time period for statistics
 */
export type TimePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'

/**
 * Ranking category
 */
export type RankingCategory =
  | 'downloads'
  | 'installs'
  | 'rating'
  | 'reviews'
  | 'trending'
  | 'new'

/**
 * Plugin statistics
 */
export interface PluginStats {
  pluginId: string
  pluginName: string
  downloads: DownloadStats
  installs: InstallStats
  rating: RatingStats
  reviews: ReviewStats
  trends: TrendStats
  updatedAt: string
}

/**
 * Download statistics
 */
export interface DownloadStats {
  total: number
  lastDay: number
  lastWeek: number
  lastMonth: number
  history: TimeSeriesData[]
}

/**
 * Install statistics
 */
export interface InstallStats {
  total: number
  active: number
  uninstalled: number
  retentionRate: number
  avgDaysActive: number
}

/**
 * Rating statistics
 */
export interface RatingStats {
  average: number
  count: number
  distribution: {
    1: number
    2: number
    3: number
    4: number
    5: number
  }
}

/**
 * Review statistics
 */
export interface ReviewStats {
  total: number
  withText: number
  avgLength: number
  sentiment: {
    positive: number
    neutral: number
    negative: number
  }
  recentReviews: Review[]
}

/**
 * Individual review
 */
export interface Review {
  id: string
  userId: string
  userName: string
  rating: number
  text?: string
  createdAt: string
  helpful: number
  verified: boolean
}

/**
 * Trend statistics
 */
export interface TrendStats {
  growthRate: number // percentage
  velocityScore: number // 0-100
  trendDirection: 'up' | 'down' | 'stable'
  projectedDownloads: number
  hotScore: number
}

/**
 * Time series data point
 */
export interface TimeSeriesData {
  date: string
  value: number
}

/**
 * Plugin ranking entry
 */
export interface RankingEntry {
  rank: number
  previousRank?: number
  pluginId: string
  pluginName: string
  author: string
  score: number
  change: 'up' | 'down' | 'same' | 'new'
  changeAmount?: number
  stats: {
    downloads: number
    rating: number
    reviews: number
  }
}

/**
 * Marketplace overview statistics
 */
export interface MarketplaceOverview {
  totalPlugins: number
  totalDownloads: number
  totalReviews: number
  avgRating: number
  activeUsers: number
  newPluginsThisWeek: number
  topCategories: CategoryStats[]
  growth: {
    plugins: number
    downloads: number
    users: number
  }
  updatedAt: string
}

/**
 * Category statistics
 */
export interface CategoryStats {
  category: string
  pluginCount: number
  downloadCount: number
  avgRating: number
  topPlugin: string
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  period: TimePeriod
  startDate: string
  endDate: string
  metrics: {
    downloads: TimeSeriesData[]
    installs: TimeSeriesData[]
    reviews: TimeSeriesData[]
    avgRating: TimeSeriesData[]
  }
  insights: TrendInsight[]
}

/**
 * Trend insight
 */
export interface TrendInsight {
  type: 'growth' | 'decline' | 'spike' | 'anomaly' | 'milestone'
  title: string
  description: string
  value?: number
  date?: string
  significance: 'high' | 'medium' | 'low'
}

/**
 * Calculate rating average from distribution
 */
export function calculateAverageRating(distribution: RatingStats['distribution']): number {
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0)
  if (total === 0) return 0

  const weightedSum =
    distribution[1] * 1 +
    distribution[2] * 2 +
    distribution[3] * 3 +
    distribution[4] * 4 +
    distribution[5] * 5

  return Math.round((weightedSum / total) * 10) / 10
}

/**
 * Calculate trend direction from data
 */
export function calculateTrendDirection(
  data: TimeSeriesData[]
): 'up' | 'down' | 'stable' {
  if (data.length < 2) return 'stable'

  const recent = data.slice(-7)
  const older = data.slice(-14, -7)

  if (recent.length === 0 || older.length === 0) return 'stable'

  const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length
  const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length

  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100

  if (changePercent > 5) return 'up'
  if (changePercent < -5) return 'down'
  return 'stable'
}

/**
 * Calculate growth rate
 */
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

/**
 * Calculate hot score (combination of recency, growth, and engagement)
 */
export function calculateHotScore(stats: PluginStats): number {
  const recencyScore = Math.min(stats.downloads.lastDay * 10, 30)
  const growthScore = Math.min(stats.trends.growthRate * 2, 30)
  const ratingScore = stats.rating.average * 4 // max 20
  const reviewScore = Math.min(stats.reviews.total * 0.5, 20)

  return Math.round(recencyScore + growthScore + ratingScore + reviewScore)
}

/**
 * Calculate velocity score (speed of growth)
 */
export function calculateVelocityScore(history: TimeSeriesData[]): number {
  if (history.length < 7) return 50

  const recent = history.slice(-7)
  const avgRecent = recent.reduce((sum, d) => sum + d.value, 0) / recent.length
  const maxRecent = Math.max(...recent.map((d) => d.value))

  // Normalize to 0-100
  return Math.min(Math.round((avgRecent / maxRecent) * 100), 100)
}

/**
 * Calculate retention rate
 */
export function calculateRetentionRate(active: number, total: number): number {
  if (total === 0) return 0
  return Math.round((active / total) * 100 * 10) / 10
}

/**
 * Create mock plugin stats
 */
export function createPluginStats(
  pluginId: string,
  pluginName: string,
  options: Partial<{
    totalDownloads: number
    rating: number
    reviews: number
  }> = {}
): PluginStats {
  const totalDownloads = options.totalDownloads ?? Math.floor(Math.random() * 10000)
  const rating = options.rating ?? 3.5 + Math.random() * 1.5
  const reviewCount = options.reviews ?? Math.floor(Math.random() * 100)

  const history = generateMockHistory(30, totalDownloads / 30)
  const trendDirection = calculateTrendDirection(history)

  return {
    pluginId,
    pluginName,
    downloads: {
      total: totalDownloads,
      lastDay: Math.floor(totalDownloads / 100),
      lastWeek: Math.floor(totalDownloads / 14),
      lastMonth: Math.floor(totalDownloads / 3),
      history,
    },
    installs: {
      total: Math.floor(totalDownloads * 0.8),
      active: Math.floor(totalDownloads * 0.6),
      uninstalled: Math.floor(totalDownloads * 0.2),
      retentionRate: 75,
      avgDaysActive: 45,
    },
    rating: {
      average: Math.round(rating * 10) / 10,
      count: reviewCount,
      distribution: generateRatingDistribution(reviewCount, rating),
    },
    reviews: {
      total: reviewCount,
      withText: Math.floor(reviewCount * 0.6),
      avgLength: 120,
      sentiment: {
        positive: Math.floor(reviewCount * 0.7),
        neutral: Math.floor(reviewCount * 0.2),
        negative: Math.floor(reviewCount * 0.1),
      },
      recentReviews: [],
    },
    trends: {
      growthRate: 10 + Math.random() * 20,
      velocityScore: calculateVelocityScore(history),
      trendDirection,
      projectedDownloads: Math.floor(totalDownloads * 1.2),
      hotScore: 0, // calculated later
    },
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Generate mock history data
 */
function generateMockHistory(days: number, avgValue: number): TimeSeriesData[] {
  const history: TimeSeriesData[] = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const variation = 0.5 + Math.random()
    history.push({
      date: date.toISOString().split('T')[0],
      value: Math.floor(avgValue * variation),
    })
  }

  return history
}

/**
 * Generate rating distribution
 */
function generateRatingDistribution(
  total: number,
  avg: number
): RatingStats['distribution'] {
  // Generate distribution that roughly matches the average
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

  // Weight distribution towards the average
  const weights = [
    Math.max(0, 5 - avg) * 0.1,
    Math.max(0, 5 - avg) * 0.15,
    0.2,
    Math.max(0, avg - 2) * 0.15,
    Math.max(0, avg - 3) * 0.2,
  ]

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const normalized = weights.map((w) => w / totalWeight)

  distribution[1] = Math.floor(total * normalized[0])
  distribution[2] = Math.floor(total * normalized[1])
  distribution[3] = Math.floor(total * normalized[2])
  distribution[4] = Math.floor(total * normalized[3])
  distribution[5] = Math.floor(total * normalized[4])

  // Ensure total matches
  const currentTotal = Object.values(distribution).reduce((a, b) => a + b, 0)
  distribution[5] += total - currentTotal

  return distribution
}

/**
 * Get plugin ranking
 */
export function getPluginRanking(
  plugins: PluginStats[],
  category: RankingCategory,
  limit = 10
): RankingEntry[] {
  const sorted = [...plugins].sort((a, b) => {
    switch (category) {
      case 'downloads':
        return b.downloads.total - a.downloads.total
      case 'installs':
        return b.installs.active - a.installs.active
      case 'rating':
        return b.rating.average - a.rating.average
      case 'reviews':
        return b.reviews.total - a.reviews.total
      case 'trending':
        return b.trends.hotScore - a.trends.hotScore
      case 'new':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      default:
        return 0
    }
  })

  return sorted.slice(0, limit).map((plugin, index) => ({
    rank: index + 1,
    pluginId: plugin.pluginId,
    pluginName: plugin.pluginName,
    author: 'Unknown', // Would come from plugin metadata
    score: getScoreForCategory(plugin, category),
    change: 'same' as const,
    stats: {
      downloads: plugin.downloads.total,
      rating: plugin.rating.average,
      reviews: plugin.reviews.total,
    },
  }))
}

/**
 * Get score for ranking category
 */
function getScoreForCategory(plugin: PluginStats, category: RankingCategory): number {
  switch (category) {
    case 'downloads':
      return plugin.downloads.total
    case 'installs':
      return plugin.installs.active
    case 'rating':
      return plugin.rating.average
    case 'reviews':
      return plugin.reviews.total
    case 'trending':
      return plugin.trends.hotScore
    case 'new':
      return new Date(plugin.updatedAt).getTime()
    default:
      return 0
  }
}

/**
 * Create marketplace overview
 */
export function createMarketplaceOverview(plugins: PluginStats[]): MarketplaceOverview {
  const totalDownloads = plugins.reduce((sum, p) => sum + p.downloads.total, 0)
  const totalReviews = plugins.reduce((sum, p) => sum + p.reviews.total, 0)
  const avgRating =
    plugins.length > 0
      ? plugins.reduce((sum, p) => sum + p.rating.average, 0) / plugins.length
      : 0

  return {
    totalPlugins: plugins.length,
    totalDownloads,
    totalReviews,
    avgRating: Math.round(avgRating * 10) / 10,
    activeUsers: Math.floor(totalDownloads * 0.4),
    newPluginsThisWeek: Math.floor(plugins.length * 0.05),
    topCategories: [],
    growth: {
      plugins: 15,
      downloads: 25,
      users: 20,
    },
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Analyze trends for a plugin
 */
export function analyzeTrends(
  plugin: PluginStats,
  period: TimePeriod
): TrendAnalysis {
  const now = new Date()
  const startDate = new Date(now)

  switch (period) {
    case 'day':
      startDate.setDate(startDate.getDate() - 1)
      break
    case 'week':
      startDate.setDate(startDate.getDate() - 7)
      break
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1)
      break
    case 'quarter':
      startDate.setMonth(startDate.getMonth() - 3)
      break
    case 'year':
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
    case 'all':
    default:
      startDate.setFullYear(startDate.getFullYear() - 5)
  }

  const insights: TrendInsight[] = []

  // Check for growth
  if (plugin.trends.growthRate > 50) {
    insights.push({
      type: 'growth',
      title: '급격한 성장',
      description: `최근 ${plugin.trends.growthRate}% 성장률을 기록했습니다`,
      value: plugin.trends.growthRate,
      significance: 'high',
    })
  }

  // Check for milestone
  if (plugin.downloads.total >= 10000) {
    insights.push({
      type: 'milestone',
      title: '다운로드 1만 돌파',
      description: '다운로드 10,000회를 달성했습니다',
      value: plugin.downloads.total,
      significance: 'medium',
    })
  }

  // Check for rating trend
  if (plugin.rating.average >= 4.5) {
    insights.push({
      type: 'growth',
      title: '높은 평점',
      description: '평균 평점 4.5 이상을 유지하고 있습니다',
      value: plugin.rating.average,
      significance: 'medium',
    })
  }

  log.info(`Analyzed trends for ${plugin.pluginId}: ${insights.length} insights found`)

  return {
    period,
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    metrics: {
      downloads: plugin.downloads.history,
      installs: generateMockHistory(30, plugin.installs.total / 30),
      reviews: generateMockHistory(30, plugin.reviews.total / 30),
      avgRating: generateMockHistory(30, plugin.rating.average).map((d) => ({
        ...d,
        value: Math.min(5, Math.max(0, d.value + 3)),
      })),
    },
    insights,
  }
}

/**
 * Calculate sentiment score
 */
export function calculateSentimentScore(sentiment: ReviewStats['sentiment']): number {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative
  if (total === 0) return 50

  const positiveWeight = 100
  const neutralWeight = 50
  const negativeWeight = 0

  const weightedSum =
    sentiment.positive * positiveWeight +
    sentiment.neutral * neutralWeight +
    sentiment.negative * negativeWeight

  return Math.round(weightedSum / total)
}

/**
 * Format large numbers
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

/**
 * Format percentage change
 */
export function formatChange(value: number): { text: string; color: string; icon: string } {
  if (value > 0) {
    return {
      text: `+${value}%`,
      color: 'text-green-500',
      icon: '↑',
    }
  }
  if (value < 0) {
    return {
      text: `${value}%`,
      color: 'text-red-500',
      icon: '↓',
    }
  }
  return {
    text: '0%',
    color: 'text-gray-500',
    icon: '→',
  }
}

/**
 * Get period label
 */
export function getPeriodLabel(period: TimePeriod): string {
  const labels: Record<TimePeriod, string> = {
    day: '오늘',
    week: '이번 주',
    month: '이번 달',
    quarter: '분기',
    year: '올해',
    all: '전체',
  }
  return labels[period]
}

/**
 * Get ranking category label
 */
export function getRankingCategoryLabel(category: RankingCategory): string {
  const labels: Record<RankingCategory, string> = {
    downloads: '다운로드',
    installs: '설치',
    rating: '평점',
    reviews: '리뷰',
    trending: '트렌딩',
    new: '신규',
  }
  return labels[category]
}
