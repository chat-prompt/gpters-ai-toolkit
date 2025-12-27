import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://toolkit.gpters.org'

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
