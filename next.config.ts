import type { NextConfig } from "next";

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

export default nextConfig;
