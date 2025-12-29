/**
 * Image Optimization Utilities
 *
 * Provides comprehensive image optimization for Next.js applications including:
 * - Responsive sizing with srcset generation
 * - Blur placeholder data URL generation
 * - Modern format (WebP/AVIF) detection
 * - Lazy loading configuration
 * - Image preloading utilities
 * - Performance metrics
 */

// ============================================================================
// Types
// ============================================================================

export interface ImageDimensions {
  width: number
  height: number
}

export interface ResponsiveBreakpoint {
  name: string
  minWidth: number
  maxWidth: number
  imageWidth: number
}

export interface ImageSizesConfig {
  default: string
  breakpoints: ResponsiveBreakpoint[]
}

export interface ImageOptimizationConfig {
  quality: number
  priority: boolean
  loading: 'lazy' | 'eager'
  placeholder: 'blur' | 'empty' | 'none'
  sizes?: string
  unoptimized?: boolean
}

export interface BlurPlaceholder {
  blurDataURL: string
  width: number
  height: number
}

export interface ImagePreloadConfig {
  src: string
  srcSet?: string
  sizes?: string
  type?: 'image/webp' | 'image/avif' | 'image/png' | 'image/jpeg'
}

export interface ImagePerformanceMetrics {
  loadTime: number
  size: number
  format: string
  cached: boolean
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default responsive breakpoints for image sizing
 */
export const DEFAULT_BREAKPOINTS: ResponsiveBreakpoint[] = [
  { name: 'mobile', minWidth: 0, maxWidth: 639, imageWidth: 640 },
  { name: 'tablet', minWidth: 640, maxWidth: 1023, imageWidth: 768 },
  { name: 'desktop', minWidth: 1024, maxWidth: 1279, imageWidth: 1024 },
  { name: 'large', minWidth: 1280, maxWidth: 1535, imageWidth: 1280 },
  { name: 'xlarge', minWidth: 1536, maxWidth: Infinity, imageWidth: 1536 },
]

/**
 * Standard image widths for srcset generation
 */
export const SRCSET_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]

/**
 * Avatar size presets
 */
export const AVATAR_SIZES = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  '2xl': 96,
} as const

/**
 * Logo size presets
 */
export const LOGO_SIZES = {
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 48, height: 48 },
  xl: { width: 64, height: 64 },
} as const

/**
 * OG Image dimensions (standard sizes)
 */
export const OG_IMAGE_SIZES = {
  facebook: { width: 1200, height: 630 },
  twitter: { width: 1200, height: 600 },
  linkedin: { width: 1200, height: 627 },
} as const

/**
 * Default image quality levels
 */
export const QUALITY_PRESETS = {
  low: 60,
  medium: 75,
  high: 85,
  maximum: 100,
} as const

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Check if the browser supports WebP format
 */
export function supportsWebP(): boolean {
  if (typeof window === 'undefined') return true // SSR assumes support

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
}

/**
 * Check if the browser supports AVIF format
 */
export function supportsAVIF(): boolean {
  if (typeof window === 'undefined') return true // SSR assumes support

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const dataUrl = canvas.toDataURL('image/avif')
  return dataUrl.startsWith('data:image/avif')
}

/**
 * Get the best supported image format
 */
export function getBestFormat(): 'avif' | 'webp' | 'png' {
  if (supportsAVIF()) return 'avif'
  if (supportsWebP()) return 'webp'
  return 'png'
}

/**
 * Get image format from URL or file extension
 */
export function getImageFormat(src: string): string {
  const extension = src.split('.').pop()?.toLowerCase()
  const formatMap: Record<string, string> = {
    jpg: 'jpeg',
    jpeg: 'jpeg',
    png: 'png',
    gif: 'gif',
    webp: 'webp',
    avif: 'avif',
    svg: 'svg+xml',
  }
  return formatMap[extension || ''] || 'unknown'
}

// ============================================================================
// Responsive Sizing
// ============================================================================

/**
 * Generate sizes attribute for responsive images
 */
export function generateSizes(
  breakpoints: ResponsiveBreakpoint[] = DEFAULT_BREAKPOINTS
): string {
  const sizes = breakpoints
    .filter(bp => bp.maxWidth !== Infinity)
    .map(bp => `(max-width: ${bp.maxWidth}px) ${bp.imageWidth}px`)

  // Add default size for largest breakpoint
  const defaultSize = breakpoints.find(bp => bp.maxWidth === Infinity)?.imageWidth || 1920
  sizes.push(`${defaultSize}px`)

  return sizes.join(', ')
}

/**
 * Generate custom sizes attribute for specific use cases
 */
export function generateCustomSizes(config: ImageSizesConfig): string {
  const sizes = config.breakpoints
    .filter(bp => bp.maxWidth !== Infinity)
    .map(bp => `(max-width: ${bp.maxWidth}px) ${bp.imageWidth}px`)

  sizes.push(config.default)

  return sizes.join(', ')
}

/**
 * Calculate aspect ratio
 */
export function calculateAspectRatio(width: number, height: number): number {
  return width / height
}

/**
 * Calculate dimensions maintaining aspect ratio
 */
export function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  targetWidth?: number,
  targetHeight?: number
): ImageDimensions {
  const aspectRatio = calculateAspectRatio(originalWidth, originalHeight)

  if (targetWidth && !targetHeight) {
    return {
      width: targetWidth,
      height: Math.round(targetWidth / aspectRatio),
    }
  }

  if (targetHeight && !targetWidth) {
    return {
      width: Math.round(targetHeight * aspectRatio),
      height: targetHeight,
    }
  }

  if (targetWidth && targetHeight) {
    return { width: targetWidth, height: targetHeight }
  }

  return { width: originalWidth, height: originalHeight }
}

/**
 * Get optimal image width for current viewport
 */
export function getOptimalImageWidth(
  breakpoints: ResponsiveBreakpoint[] = DEFAULT_BREAKPOINTS
): number {
  if (typeof window === 'undefined') return 1200 // SSR default

  const viewportWidth = window.innerWidth
  const devicePixelRatio = window.devicePixelRatio || 1

  const breakpoint = breakpoints.find(
    bp => viewportWidth >= bp.minWidth && viewportWidth <= bp.maxWidth
  ) || breakpoints[breakpoints.length - 1]

  return Math.round(breakpoint.imageWidth * devicePixelRatio)
}

// ============================================================================
// Blur Placeholder
// ============================================================================

/**
 * Generate a simple blur placeholder data URL
 * Uses a tiny colored rectangle as a placeholder
 */
export function generateBlurPlaceholder(
  color: string = '#e5e7eb',
  width: number = 8,
  height: number = 8
): BlurPlaceholder {
  // Convert hex to RGB
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Create a simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="rgb(${r},${g},${b})"/>
  </svg>`

  const base64 = typeof btoa !== 'undefined'
    ? btoa(svg)
    : Buffer.from(svg).toString('base64')

  return {
    blurDataURL: `data:image/svg+xml;base64,${base64}`,
    width,
    height,
  }
}

/**
 * Generate gradient blur placeholder
 */
export function generateGradientPlaceholder(
  colors: [string, string] = ['#e5e7eb', '#f3f4f6'],
  width: number = 8,
  height: number = 8
): BlurPlaceholder {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${colors[0]}"/>
        <stop offset="100%" style="stop-color:${colors[1]}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`

  const base64 = typeof btoa !== 'undefined'
    ? btoa(svg)
    : Buffer.from(svg).toString('base64')

  return {
    blurDataURL: `data:image/svg+xml;base64,${base64}`,
    width,
    height,
  }
}

/**
 * Get placeholder color based on image type/category
 */
export function getCategoryPlaceholderColor(category: string): string {
  const colorMap: Record<string, string> = {
    skill: '#6366f1',    // Indigo
    agent: '#10b981',    // Emerald
    command: '#f59e0b',  // Amber
    guide: '#3b82f6',    // Blue
    default: '#6b7280',  // Gray
  }
  return colorMap[category] || colorMap.default
}

// ============================================================================
// Optimization Configuration
// ============================================================================

/**
 * Get optimization config for different image use cases
 */
export function getOptimizationConfig(
  useCase: 'hero' | 'card' | 'thumbnail' | 'avatar' | 'og' | 'logo' | 'background'
): ImageOptimizationConfig {
  const configs: Record<string, ImageOptimizationConfig> = {
    hero: {
      quality: QUALITY_PRESETS.high,
      priority: true,
      loading: 'eager',
      placeholder: 'blur',
      sizes: '100vw',
    },
    card: {
      quality: QUALITY_PRESETS.medium,
      priority: false,
      loading: 'lazy',
      placeholder: 'blur',
      sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
    },
    thumbnail: {
      quality: QUALITY_PRESETS.low,
      priority: false,
      loading: 'lazy',
      placeholder: 'blur',
      sizes: '(max-width: 640px) 50vw, 200px',
    },
    avatar: {
      quality: QUALITY_PRESETS.medium,
      priority: false,
      loading: 'lazy',
      placeholder: 'empty',
      sizes: '64px',
    },
    og: {
      quality: QUALITY_PRESETS.high,
      priority: true,
      loading: 'eager',
      placeholder: 'none',
      sizes: '1200px',
    },
    logo: {
      quality: QUALITY_PRESETS.maximum,
      priority: true,
      loading: 'eager',
      placeholder: 'empty',
      unoptimized: false,
    },
    background: {
      quality: QUALITY_PRESETS.medium,
      priority: false,
      loading: 'lazy',
      placeholder: 'blur',
      sizes: '100vw',
    },
  }

  return configs[useCase] || configs.card
}

// ============================================================================
// Image Preloading
// ============================================================================

/**
 * Preload critical images
 */
export function preloadImage(config: ImagePreloadConfig): void {
  if (typeof window === 'undefined') return

  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = config.src

  if (config.srcSet) {
    link.setAttribute('imagesrcset', config.srcSet)
  }
  if (config.sizes) {
    link.setAttribute('imagesizes', config.sizes)
  }
  if (config.type) {
    link.type = config.type
  }

  document.head.appendChild(link)
}

/**
 * Preload multiple images
 */
export function preloadImages(configs: ImagePreloadConfig[]): void {
  configs.forEach(preloadImage)
}

/**
 * Create intersection observer for lazy image loading
 */
export function createImageObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null
  }

  return new IntersectionObserver(callback, {
    rootMargin: '50px 0px',
    threshold: 0.01,
    ...options,
  })
}

// ============================================================================
// Performance Utilities
// ============================================================================

/**
 * Measure image load performance
 */
export function measureImagePerformance(
  src: string
): Promise<ImagePerformanceMetrics> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Cannot measure in SSR'))
      return
    }

    const startTime = performance.now()
    const img = new Image()

    img.onload = () => {
      const loadTime = performance.now() - startTime

      // Try to get resource timing data
      const entries = performance.getEntriesByName(src, 'resource')
      const resourceEntry = entries[entries.length - 1] as PerformanceResourceTiming | undefined

      resolve({
        loadTime,
        size: resourceEntry?.transferSize || 0,
        format: getImageFormat(src),
        cached: resourceEntry ? resourceEntry.transferSize === 0 : false,
      })
    }

    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/**
 * Calculate estimated bytes saved by optimization
 */
export function estimateSavings(
  originalSize: number,
  format: 'webp' | 'avif' | 'png' | 'jpeg'
): number {
  const reductionRates: Record<string, number> = {
    avif: 0.5,  // ~50% smaller
    webp: 0.3,  // ~30% smaller
    png: 0,
    jpeg: 0.1,  // ~10% with quality reduction
  }

  return Math.round(originalSize * (reductionRates[format] || 0))
}

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Build optimized image URL with parameters
 */
export function buildImageUrl(
  src: string,
  params: {
    width?: number
    height?: number
    quality?: number
    format?: 'webp' | 'avif' | 'png' | 'jpeg'
  }
): string {
  // For Next.js Image optimization
  const searchParams = new URLSearchParams()

  if (params.width) searchParams.set('w', params.width.toString())
  if (params.height) searchParams.set('h', params.height.toString())
  if (params.quality) searchParams.set('q', params.quality.toString())

  const queryString = searchParams.toString()
  return queryString ? `${src}?${queryString}` : src
}

/**
 * Check if URL is external
 */
export function isExternalUrl(src: string): boolean {
  try {
    const url = new URL(src, 'http://localhost')
    return url.origin !== 'http://localhost'
  } catch {
    return false
  }
}

/**
 * Check if URL is a data URL
 */
export function isDataUrl(src: string): boolean {
  return src.startsWith('data:')
}

/**
 * Check if URL is an SVG
 */
export function isSvgUrl(src: string): boolean {
  return src.endsWith('.svg') || src.includes('.svg?')
}

// ============================================================================
// Srcset Generation
// ============================================================================

/**
 * Generate srcset string for responsive images
 */
export function generateSrcset(
  src: string,
  widths: number[] = SRCSET_WIDTHS
): string {
  if (isDataUrl(src) || isSvgUrl(src)) return ''

  return widths
    .map(width => `${buildImageUrl(src, { width })} ${width}w`)
    .join(', ')
}

/**
 * Generate srcset for retina displays
 */
export function generateRetinaSrcset(
  src: string,
  baseWidth: number
): string {
  const widths = [baseWidth, baseWidth * 2, baseWidth * 3]
  const descriptors = ['1x', '2x', '3x']

  return widths
    .map((width, i) => `${buildImageUrl(src, { width })} ${descriptors[i]}`)
    .join(', ')
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate image dimensions
 */
export function validateDimensions(
  width: number,
  height: number,
  constraints?: {
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    aspectRatio?: number
    aspectRatioTolerance?: number
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (constraints?.minWidth && width < constraints.minWidth) {
    errors.push(`Width ${width} is below minimum ${constraints.minWidth}`)
  }
  if (constraints?.maxWidth && width > constraints.maxWidth) {
    errors.push(`Width ${width} exceeds maximum ${constraints.maxWidth}`)
  }
  if (constraints?.minHeight && height < constraints.minHeight) {
    errors.push(`Height ${height} is below minimum ${constraints.minHeight}`)
  }
  if (constraints?.maxHeight && height > constraints.maxHeight) {
    errors.push(`Height ${height} exceeds maximum ${constraints.maxHeight}`)
  }

  if (constraints?.aspectRatio) {
    const actualRatio = width / height
    const tolerance = constraints.aspectRatioTolerance || 0.01
    if (Math.abs(actualRatio - constraints.aspectRatio) > tolerance) {
      errors.push(
        `Aspect ratio ${actualRatio.toFixed(2)} differs from expected ${constraints.aspectRatio}`
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Get recommended dimensions for OG image
 */
export function getOgImageRecommendation(
  platform: keyof typeof OG_IMAGE_SIZES = 'facebook'
): ImageDimensions & { aspectRatio: number } {
  const dimensions = OG_IMAGE_SIZES[platform]
  return {
    ...dimensions,
    aspectRatio: calculateAspectRatio(dimensions.width, dimensions.height),
  }
}
