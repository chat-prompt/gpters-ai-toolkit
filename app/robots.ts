/**
 * Robots.txt generator
 *
 * Generates robots.txt directives for search engine crawlers.
 * Allows public pages while blocking admin, API, and upload routes.
 */
import type { MetadataRoute } from 'next'

/**
 * Generate robots.txt configuration
 *
 * @returns Robots.txt rules and sitemap reference
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://company-ai-toolkit.vercel.app'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/upload'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
