/**
 * Dynamic sitemap generator
 *
 * Generates XML sitemap for search engine indexing.
 * Includes static pages and all catalog item detail pages for all locales.
 */
import type { MetadataRoute } from 'next'
import { getCatalog } from '@/lib/core/catalog'
import { getBaseUrl } from '@/lib/utils'

/**
 * Generate sitemap entries for all public pages across all locales
 *
 * @returns Array of sitemap entries with URLs and metadata
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const catalog = await getCatalog()

  const staticPaths = ['', '/getting-started', '/guides']
  const priorities: Record<string, number> = {
    '': 1,
    '/getting-started': 0.9,
    '/guides': 0.8,
  }

  const staticPages: MetadataRoute.Sitemap = staticPaths.flatMap((path) => [
    {
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: path === '' ? ('daily' as const) : ('weekly' as const),
      priority: priorities[path] ?? 0.8,
    },
    {
      url: `${baseUrl}/en${path}`,
      lastModified: new Date(),
      changeFrequency: path === '' ? ('daily' as const) : ('weekly' as const),
      priority: priorities[path] ?? 0.8,
    },
  ])

  const catalogPages: MetadataRoute.Sitemap = catalog.flatMap((item) => [
    {
      url: `${baseUrl}/${item.type}/${item.id}`,
      lastModified: item.updatedAt ? new Date(item.updatedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/en/${item.type}/${item.id}`,
      lastModified: item.updatedAt ? new Date(item.updatedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
  ])

  return [...staticPages, ...catalogPages]
}
