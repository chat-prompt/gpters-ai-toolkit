import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Exclude server-only packages from client bundles
  serverExternalPackages: ['@neondatabase/serverless', '@octokit/rest', 'jszip', 'drizzle-orm'],

  // Image optimization
  images: {
    // Allow external images (Google avatars, etc.)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
      },
    ],
    // Optimize image formats
    formats: ['image/avif', 'image/webp'],
  },

  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports for smaller bundles
    optimizePackageImports: ['react-markdown', 'remark-gfm', 'rehype-sanitize'],
  },

  // Production optimizations
  poweredByHeader: false,
  compress: true,

  // Cache and performance headers
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on',
        },
      ],
    },
    {
      // Static assets (JS, CSS) - immutable, long-term cache
      source: '/_next/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      // Public images and static files - moderate cache
      source: '/images/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=86400, stale-while-revalidate=604800',
        },
      ],
    },
    {
      // OG image - moderate cache
      source: '/og-image.png',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=86400, stale-while-revalidate=604800',
        },
      ],
    },
    {
      // Favicon and icons - long-term cache
      source: '/:path(favicon.ico|icon.svg|apple-touch-icon.png)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=604800, stale-while-revalidate=2592000',
        },
      ],
    },
    {
      source: '/api/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=60, stale-while-revalidate=300',
        },
      ],
    },
  ],
};

export default withNextIntl(nextConfig);
