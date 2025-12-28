/**
 * Plugin Marketplace Statistics Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateAverageRating,
  calculateTrendDirection,
  calculateGrowthRate,
  calculateHotScore,
  calculateVelocityScore,
  calculateRetentionRate,
  calculateSentimentScore,
  createPluginStats,
  getPluginRanking,
  createMarketplaceOverview,
  analyzeTrends,
  formatNumber,
  formatChange,
  getPeriodLabel,
  getRankingCategoryLabel,
  type PluginStats,
  type TimeSeriesData,
  type RatingStats,
  type ReviewStats,
  type TimePeriod,
  type RankingCategory,
} from '@/lib/plugin-marketplace-stats'

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('plugin-marketplace-stats', () => {
  describe('calculateAverageRating', () => {
    it('should calculate weighted average rating', () => {
      const distribution: RatingStats['distribution'] = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 10,
      }

      expect(calculateAverageRating(distribution)).toBe(5)
    })

    it('should handle mixed distribution', () => {
      const distribution: RatingStats['distribution'] = {
        1: 1,
        2: 1,
        3: 1,
        4: 1,
        5: 1,
      }

      // (1+2+3+4+5) / 5 = 3
      expect(calculateAverageRating(distribution)).toBe(3)
    })

    it('should return 0 for empty distribution', () => {
      const distribution: RatingStats['distribution'] = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      }

      expect(calculateAverageRating(distribution)).toBe(0)
    })

    it('should round to one decimal place', () => {
      const distribution: RatingStats['distribution'] = {
        1: 1,
        2: 0,
        3: 0,
        4: 1,
        5: 1,
      }

      // (1+4+5) / 3 = 3.333...
      expect(calculateAverageRating(distribution)).toBe(3.3)
    })

    it('should handle skewed positive distribution', () => {
      const distribution: RatingStats['distribution'] = {
        1: 1,
        2: 2,
        3: 10,
        4: 30,
        5: 57,
      }

      const result = calculateAverageRating(distribution)
      expect(result).toBeGreaterThan(4)
      expect(result).toBeLessThan(5)
    })
  })

  describe('calculateTrendDirection', () => {
    it('should return stable for insufficient data', () => {
      expect(calculateTrendDirection([])).toBe('stable')
      expect(calculateTrendDirection([{ date: '2024-01-01', value: 100 }])).toBe('stable')
    })

    it('should detect upward trend', () => {
      const data: TimeSeriesData[] = []
      const now = new Date()

      // Older data (lower values)
      for (let i = 14; i > 7; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        data.push({ date: date.toISOString().split('T')[0], value: 50 })
      }

      // Recent data (higher values)
      for (let i = 7; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        data.push({ date: date.toISOString().split('T')[0], value: 100 })
      }

      expect(calculateTrendDirection(data)).toBe('up')
    })

    it('should detect downward trend', () => {
      const data: TimeSeriesData[] = []
      const now = new Date()

      // Older data (higher values)
      for (let i = 14; i > 7; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        data.push({ date: date.toISOString().split('T')[0], value: 100 })
      }

      // Recent data (lower values)
      for (let i = 7; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        data.push({ date: date.toISOString().split('T')[0], value: 50 })
      }

      expect(calculateTrendDirection(data)).toBe('down')
    })

    it('should detect stable trend', () => {
      const data: TimeSeriesData[] = []
      const now = new Date()

      for (let i = 14; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        data.push({ date: date.toISOString().split('T')[0], value: 100 })
      }

      expect(calculateTrendDirection(data)).toBe('stable')
    })
  })

  describe('calculateGrowthRate', () => {
    it('should calculate positive growth', () => {
      expect(calculateGrowthRate(120, 100)).toBe(20)
    })

    it('should calculate negative growth', () => {
      expect(calculateGrowthRate(80, 100)).toBe(-20)
    })

    it('should handle zero previous value', () => {
      expect(calculateGrowthRate(100, 0)).toBe(100)
      expect(calculateGrowthRate(0, 0)).toBe(0)
    })

    it('should round to one decimal place', () => {
      expect(calculateGrowthRate(133, 100)).toBe(33)
      expect(calculateGrowthRate(133.33, 100)).toBe(33.3)
    })

    it('should calculate 100% growth (doubling)', () => {
      expect(calculateGrowthRate(200, 100)).toBe(100)
    })
  })

  describe('calculateHotScore', () => {
    it('should calculate hot score from stats', () => {
      const stats: PluginStats = createPluginStats('test', 'Test Plugin', {
        totalDownloads: 1000,
        rating: 4.5,
        reviews: 50,
      })

      const score = calculateHotScore(stats)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should give higher scores to active plugins', () => {
      const activeStats = createPluginStats('active', 'Active Plugin', {
        totalDownloads: 10000,
        rating: 5,
        reviews: 100,
      })

      const inactiveStats = createPluginStats('inactive', 'Inactive Plugin', {
        totalDownloads: 100,
        rating: 3,
        reviews: 5,
      })

      expect(calculateHotScore(activeStats)).toBeGreaterThan(calculateHotScore(inactiveStats))
    })

    it('should cap individual components', () => {
      const extremeStats = createPluginStats('extreme', 'Extreme Plugin', {
        totalDownloads: 1000000,
        rating: 5,
        reviews: 10000,
      })

      const score = calculateHotScore(extremeStats)
      // Score should be capped reasonably
      expect(score).toBeLessThanOrEqual(150) // rough upper bound
    })
  })

  describe('calculateVelocityScore', () => {
    it('should return 50 for insufficient data', () => {
      expect(calculateVelocityScore([])).toBe(50)
      expect(calculateVelocityScore([{ date: '2024-01-01', value: 100 }])).toBe(50)
    })

    it('should calculate velocity from recent data', () => {
      const history: TimeSeriesData[] = []
      const now = new Date()

      for (let i = 7; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        history.push({ date: date.toISOString().split('T')[0], value: 100 })
      }

      const score = calculateVelocityScore(history)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should give higher scores for consistent data', () => {
      const history: TimeSeriesData[] = []
      const now = new Date()

      for (let i = 7; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        history.push({ date: date.toISOString().split('T')[0], value: 100 })
      }

      // All same values = avg/max = 100%
      expect(calculateVelocityScore(history)).toBe(100)
    })
  })

  describe('calculateRetentionRate', () => {
    it('should calculate retention percentage', () => {
      expect(calculateRetentionRate(80, 100)).toBe(80)
    })

    it('should handle zero total', () => {
      expect(calculateRetentionRate(0, 0)).toBe(0)
    })

    it('should round to one decimal place', () => {
      expect(calculateRetentionRate(33, 100)).toBe(33)
      expect(calculateRetentionRate(33, 99)).toBe(33.3)
    })

    it('should handle 100% retention', () => {
      expect(calculateRetentionRate(100, 100)).toBe(100)
    })
  })

  describe('calculateSentimentScore', () => {
    it('should return 100 for all positive', () => {
      expect(calculateSentimentScore({ positive: 10, neutral: 0, negative: 0 })).toBe(100)
    })

    it('should return 50 for all neutral', () => {
      expect(calculateSentimentScore({ positive: 0, neutral: 10, negative: 0 })).toBe(50)
    })

    it('should return 0 for all negative', () => {
      expect(calculateSentimentScore({ positive: 0, neutral: 0, negative: 10 })).toBe(0)
    })

    it('should return 50 for empty data', () => {
      expect(calculateSentimentScore({ positive: 0, neutral: 0, negative: 0 })).toBe(50)
    })

    it('should calculate mixed sentiment', () => {
      const score = calculateSentimentScore({ positive: 50, neutral: 30, negative: 20 })
      expect(score).toBeGreaterThan(50)
      expect(score).toBeLessThan(100)
    })
  })

  describe('createPluginStats', () => {
    it('should create plugin stats with defaults', () => {
      const stats = createPluginStats('test-id', 'Test Plugin')

      expect(stats.pluginId).toBe('test-id')
      expect(stats.pluginName).toBe('Test Plugin')
      expect(stats.downloads).toBeDefined()
      expect(stats.installs).toBeDefined()
      expect(stats.rating).toBeDefined()
      expect(stats.reviews).toBeDefined()
      expect(stats.trends).toBeDefined()
    })

    it('should accept custom options', () => {
      const stats = createPluginStats('test-id', 'Test Plugin', {
        totalDownloads: 5000,
        rating: 4.5,
        reviews: 100,
      })

      expect(stats.downloads.total).toBe(5000)
      expect(stats.rating.average).toBe(4.5)
      expect(stats.reviews.total).toBe(100)
    })

    it('should generate download history', () => {
      const stats = createPluginStats('test-id', 'Test Plugin')

      expect(stats.downloads.history).toBeDefined()
      expect(stats.downloads.history.length).toBe(30)
    })

    it('should calculate derived values', () => {
      const stats = createPluginStats('test-id', 'Test Plugin', {
        totalDownloads: 10000,
      })

      expect(stats.downloads.lastDay).toBeLessThan(stats.downloads.total)
      expect(stats.downloads.lastWeek).toBeLessThan(stats.downloads.total)
      expect(stats.installs.total).toBeLessThan(stats.downloads.total)
    })

    it('should set trends direction', () => {
      const stats = createPluginStats('test-id', 'Test Plugin')

      expect(['up', 'down', 'stable']).toContain(stats.trends.trendDirection)
    })
  })

  describe('getPluginRanking', () => {
    let plugins: PluginStats[]

    beforeEach(() => {
      plugins = [
        createPluginStats('plugin-1', 'Plugin 1', { totalDownloads: 1000, rating: 4.0, reviews: 50 }),
        createPluginStats('plugin-2', 'Plugin 2', { totalDownloads: 5000, rating: 4.5, reviews: 100 }),
        createPluginStats('plugin-3', 'Plugin 3', { totalDownloads: 2000, rating: 5.0, reviews: 25 }),
      ]
    })

    it('should rank by downloads', () => {
      const rankings = getPluginRanking(plugins, 'downloads')

      expect(rankings[0].pluginId).toBe('plugin-2')
      expect(rankings[0].rank).toBe(1)
      expect(rankings[1].pluginId).toBe('plugin-3')
      expect(rankings[2].pluginId).toBe('plugin-1')
    })

    it('should rank by rating', () => {
      const rankings = getPluginRanking(plugins, 'rating')

      expect(rankings[0].pluginId).toBe('plugin-3')
      expect(rankings[0].stats.rating).toBe(5.0)
    })

    it('should rank by reviews', () => {
      const rankings = getPluginRanking(plugins, 'reviews')

      expect(rankings[0].pluginId).toBe('plugin-2')
      expect(rankings[0].stats.reviews).toBe(100)
    })

    it('should limit results', () => {
      const rankings = getPluginRanking(plugins, 'downloads', 2)

      expect(rankings.length).toBe(2)
    })

    it('should include proper ranking metadata', () => {
      const rankings = getPluginRanking(plugins, 'downloads')

      rankings.forEach((entry, index) => {
        expect(entry.rank).toBe(index + 1)
        expect(entry.stats).toBeDefined()
        expect(entry.pluginName).toBeDefined()
        expect(entry.author).toBeDefined()
      })
    })

    it('should handle empty plugins array', () => {
      const rankings = getPluginRanking([], 'downloads')
      expect(rankings).toEqual([])
    })
  })

  describe('createMarketplaceOverview', () => {
    it('should create overview from plugins', () => {
      const plugins = [
        createPluginStats('p1', 'Plugin 1', { totalDownloads: 1000, rating: 4.0, reviews: 50 }),
        createPluginStats('p2', 'Plugin 2', { totalDownloads: 2000, rating: 5.0, reviews: 100 }),
      ]

      const overview = createMarketplaceOverview(plugins)

      expect(overview.totalPlugins).toBe(2)
      expect(overview.totalDownloads).toBe(3000)
      expect(overview.totalReviews).toBe(150)
      expect(overview.avgRating).toBe(4.5)
    })

    it('should handle empty plugins array', () => {
      const overview = createMarketplaceOverview([])

      expect(overview.totalPlugins).toBe(0)
      expect(overview.totalDownloads).toBe(0)
      expect(overview.avgRating).toBe(0)
    })

    it('should include growth metrics', () => {
      const plugins = [createPluginStats('p1', 'Plugin 1')]
      const overview = createMarketplaceOverview(plugins)

      expect(overview.growth).toBeDefined()
      expect(overview.growth.plugins).toBeDefined()
      expect(overview.growth.downloads).toBeDefined()
      expect(overview.growth.users).toBeDefined()
    })

    it('should set updatedAt timestamp', () => {
      const overview = createMarketplaceOverview([])

      expect(overview.updatedAt).toBeDefined()
      expect(new Date(overview.updatedAt).getTime()).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('analyzeTrends', () => {
    it('should analyze trends for different periods', () => {
      const plugin = createPluginStats('test', 'Test Plugin', {
        totalDownloads: 10000,
        rating: 4.5,
      })

      const periods: TimePeriod[] = ['day', 'week', 'month', 'quarter', 'year', 'all']

      periods.forEach((period) => {
        const analysis = analyzeTrends(plugin, period)

        expect(analysis.period).toBe(period)
        expect(analysis.startDate).toBeDefined()
        expect(analysis.endDate).toBeDefined()
        expect(analysis.metrics).toBeDefined()
      })
    })

    it('should include metrics data', () => {
      const plugin = createPluginStats('test', 'Test Plugin')
      const analysis = analyzeTrends(plugin, 'week')

      expect(analysis.metrics.downloads).toBeDefined()
      expect(analysis.metrics.installs).toBeDefined()
      expect(analysis.metrics.reviews).toBeDefined()
      expect(analysis.metrics.avgRating).toBeDefined()
    })

    it('should detect growth insight for high growth rate', () => {
      const plugin = createPluginStats('test', 'Test Plugin')
      plugin.trends.growthRate = 60 // High growth

      const analysis = analyzeTrends(plugin, 'month')

      const growthInsight = analysis.insights.find((i) => i.type === 'growth' && i.title === '급격한 성장')
      expect(growthInsight).toBeDefined()
    })

    it('should detect milestone for 10k downloads', () => {
      const plugin = createPluginStats('test', 'Test Plugin', { totalDownloads: 15000 })

      const analysis = analyzeTrends(plugin, 'month')

      const milestoneInsight = analysis.insights.find((i) => i.type === 'milestone')
      expect(milestoneInsight).toBeDefined()
    })

    it('should detect high rating insight', () => {
      const plugin = createPluginStats('test', 'Test Plugin', { rating: 4.8 })

      const analysis = analyzeTrends(plugin, 'month')

      const ratingInsight = analysis.insights.find((i) => i.title === '높은 평점')
      expect(ratingInsight).toBeDefined()
    })
  })

  describe('formatNumber', () => {
    it('should format millions', () => {
      expect(formatNumber(1000000)).toBe('1.0M')
      expect(formatNumber(1500000)).toBe('1.5M')
      expect(formatNumber(10000000)).toBe('10.0M')
    })

    it('should format thousands', () => {
      expect(formatNumber(1000)).toBe('1.0K')
      expect(formatNumber(1500)).toBe('1.5K')
      expect(formatNumber(10000)).toBe('10.0K')
    })

    it('should keep small numbers as is', () => {
      expect(formatNumber(0)).toBe('0')
      expect(formatNumber(100)).toBe('100')
      expect(formatNumber(999)).toBe('999')
    })
  })

  describe('formatChange', () => {
    it('should format positive change', () => {
      const result = formatChange(25)

      expect(result.text).toBe('+25%')
      expect(result.color).toBe('text-green-500')
      expect(result.icon).toBe('↑')
    })

    it('should format negative change', () => {
      const result = formatChange(-15)

      expect(result.text).toBe('-15%')
      expect(result.color).toBe('text-red-500')
      expect(result.icon).toBe('↓')
    })

    it('should format zero change', () => {
      const result = formatChange(0)

      expect(result.text).toBe('0%')
      expect(result.color).toBe('text-gray-500')
      expect(result.icon).toBe('→')
    })
  })

  describe('getPeriodLabel', () => {
    it('should return Korean labels for all periods', () => {
      expect(getPeriodLabel('day')).toBe('오늘')
      expect(getPeriodLabel('week')).toBe('이번 주')
      expect(getPeriodLabel('month')).toBe('이번 달')
      expect(getPeriodLabel('quarter')).toBe('분기')
      expect(getPeriodLabel('year')).toBe('올해')
      expect(getPeriodLabel('all')).toBe('전체')
    })
  })

  describe('getRankingCategoryLabel', () => {
    it('should return Korean labels for all categories', () => {
      expect(getRankingCategoryLabel('downloads')).toBe('다운로드')
      expect(getRankingCategoryLabel('installs')).toBe('설치')
      expect(getRankingCategoryLabel('rating')).toBe('평점')
      expect(getRankingCategoryLabel('reviews')).toBe('리뷰')
      expect(getRankingCategoryLabel('trending')).toBe('트렌딩')
      expect(getRankingCategoryLabel('new')).toBe('신규')
    })
  })

  describe('edge cases and integration', () => {
    it('should handle plugin with zero values', () => {
      const stats = createPluginStats('zero', 'Zero Plugin', {
        totalDownloads: 0,
        rating: 0,
        reviews: 0,
      })

      expect(stats.downloads.total).toBe(0)
      expect(stats.rating.average).toBe(0)
      // Hot score includes growth rate which is randomly generated,
      // so we just check it's a reasonable small value
      expect(calculateHotScore(stats)).toBeLessThan(100)
    })

    it('should handle very large numbers', () => {
      const stats = createPluginStats('large', 'Large Plugin', {
        totalDownloads: 10000000,
        rating: 5,
        reviews: 100000,
      })

      expect(formatNumber(stats.downloads.total)).toBe('10.0M')
      expect(calculateHotScore(stats)).toBeGreaterThan(0)
    })

    it('should maintain data consistency in overview', () => {
      const plugins = [
        createPluginStats('p1', 'Plugin 1', { totalDownloads: 1000 }),
        createPluginStats('p2', 'Plugin 2', { totalDownloads: 2000 }),
        createPluginStats('p3', 'Plugin 3', { totalDownloads: 3000 }),
      ]

      const overview = createMarketplaceOverview(plugins)

      expect(overview.totalPlugins).toBe(plugins.length)
      expect(overview.totalDownloads).toBe(6000)
    })

    it('should properly rank plugins with same score', () => {
      const plugins = [
        createPluginStats('p1', 'Plugin 1', { totalDownloads: 1000 }),
        createPluginStats('p2', 'Plugin 2', { totalDownloads: 1000 }),
      ]

      const rankings = getPluginRanking(plugins, 'downloads')

      // Both should have rankings, order is stable
      expect(rankings.length).toBe(2)
      expect(rankings[0].rank).toBe(1)
      expect(rankings[1].rank).toBe(2)
    })
  })
})
