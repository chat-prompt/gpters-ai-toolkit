/**
 * API Response Caching Utilities
 *
 * Provides Cache-Control headers, ETag generation, and
 * stale-while-revalidate strategies for API responses.
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Cache presets for different use cases
 */
export const CachePresets = {
  // Public catalog listing - cache for 1 minute, revalidate for 5 minutes
  catalogList: {
    maxAge: 60,
    staleWhileRevalidate: 300,
    public: true,
  },
  // Individual catalog item - cache for 2 minutes, revalidate for 10 minutes
  catalogItem: {
    maxAge: 120,
    staleWhileRevalidate: 600,
    public: true,
  },
  // MCP server responses - cache for 30 seconds
  mcp: {
    maxAge: 30,
    staleWhileRevalidate: 60,
    public: true,
  },
  // Static content - cache for 1 hour
  static: {
    maxAge: 3600,
    staleWhileRevalidate: 7200,
    public: true,
  },
  // No cache for dynamic/personalized content
  noCache: {
    maxAge: 0,
    staleWhileRevalidate: 0,
    public: false,
    noStore: true,
  },
} as const

export type CachePreset = keyof typeof CachePresets

export interface CacheOptions {
  maxAge: number
  staleWhileRevalidate?: number
  public?: boolean
  noStore?: boolean
  mustRevalidate?: boolean
}

/**
 * Generate Cache-Control header value from options
 */
export function generateCacheControl(options: CacheOptions): string {
  const parts: string[] = []

  if (options.noStore) {
    return 'no-store, no-cache, must-revalidate'
  }

  if (options.public) {
    parts.push('public')
  } else {
    parts.push('private')
  }

  parts.push(`max-age=${options.maxAge}`)

  if (options.staleWhileRevalidate) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`)
  }

  if (options.mustRevalidate) {
    parts.push('must-revalidate')
  }

  return parts.join(', ')
}

/**
 * Generate ETag from content
 */
export function generateETag(content: unknown): string {
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(content))
    .digest('hex')
  return `"${hash}"`
}

/**
 * Check if request has matching ETag (for 304 responses)
 */
export function hasMatchingETag(
  request: Request,
  etag: string
): boolean {
  const ifNoneMatch = request.headers.get('if-none-match')
  if (!ifNoneMatch) return false

  // Handle multiple ETags
  const clientEtags = ifNoneMatch.split(',').map((t) => t.trim())
  return clientEtags.includes(etag) || clientEtags.includes('*')
}

/**
 * Create a cached JSON response with proper headers
 */
export function cachedJsonResponse<T>(
  data: T,
  options: CacheOptions | CachePreset,
  request?: Request
): NextResponse<T> {
  const cacheOptions = typeof options === 'string' ? CachePresets[options] : options
  const cacheControl = generateCacheControl(cacheOptions)
  const etag = generateETag(data)

  // Check for conditional request (304 Not Modified)
  if (request && hasMatchingETag(request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'Cache-Control': cacheControl,
        'ETag': etag,
      },
    }) as NextResponse<T>
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': cacheControl,
      'ETag': etag,
      'Vary': 'Accept-Encoding',
    },
  })
}

/**
 * Add cache headers to an existing response
 */
export function addCacheHeaders(
  response: NextResponse,
  options: CacheOptions | CachePreset,
  etag?: string
): NextResponse {
  const cacheOptions = typeof options === 'string' ? CachePresets[options] : options
  const cacheControl = generateCacheControl(cacheOptions)

  response.headers.set('Cache-Control', cacheControl)
  response.headers.set('Vary', 'Accept-Encoding')

  if (etag) {
    response.headers.set('ETag', etag)
  }

  return response
}

/**
 * Invalidate cache by returning response with no-cache headers
 * Useful after mutations (POST, PUT, DELETE)
 */
export function invalidateCacheResponse<T>(
  data: T,
  status = 200
): NextResponse<T> {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}

/**
 * Create Surrogate-Key header for CDN cache invalidation
 * (Works with Vercel, Fastly, etc.)
 */
export function createSurrogateKey(...keys: string[]): string {
  return keys.join(' ')
}

/**
 * Add Surrogate-Key header for CDN cache invalidation
 */
export function addSurrogateKey(
  response: NextResponse,
  ...keys: string[]
): NextResponse {
  if (keys.length > 0) {
    response.headers.set('Surrogate-Key', createSurrogateKey(...keys))
  }
  return response
}
