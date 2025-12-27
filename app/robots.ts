import type { MetadataRoute } from 'next'

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
