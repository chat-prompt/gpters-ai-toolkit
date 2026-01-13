/**
 * Dynamic sitemap generator
 *
 * Generates XML sitemap for search engine indexing.
 * Includes static pages and all catalog item detail pages.
 */
import type { MetadataRoute } from 'next'
import { getCatalog } from '@/lib/core/catalog'

/**
 * Generate sitemap entries for all public pages
 *
 * @returns Array of sitemap entries with URLs and metadata
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-toolkit.gpters.org'
  const catalog = await getCatalog()

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/getting-started`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/guides`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]

  const catalogPages: MetadataRoute.Sitemap = catalog.map((item) => ({
    url: `${baseUrl}/${item.type}/${item.id}`,
    lastModified: item.updatedAt ? new Date(item.updatedAt) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...catalogPages]
}
