'use client'

import Image, { ImageProps } from 'next/image'
import { useState, useCallback, useMemo } from 'react'
import {
  generateBlurPlaceholder,
  generateGradientPlaceholder,
  getOptimizationConfig,
  generateSizes,
  AVATAR_SIZES,
  LOGO_SIZES,
  getCategoryPlaceholderColor,
  isExternalUrl,
  isSvgUrl,
} from '@/lib/utils/image-optimization'

// ============================================================================
// Types
// ============================================================================

interface OptimizedImageProps extends Omit<ImageProps, 'placeholder'> {
  /**
   * Image use case for automatic optimization
   */
  useCase?: 'hero' | 'card' | 'thumbnail' | 'avatar' | 'og' | 'logo' | 'background'
  /**
   * Placeholder type
   */
  placeholder?: 'blur' | 'empty' | 'gradient' | 'category'
  /**
   * Category for category-based placeholder color
   */
  category?: 'skill' | 'agent' | 'command' | 'guide'
  /**
   * Gradient colors for gradient placeholder
   */
  gradientColors?: [string, string]
  /**
   * Fallback image on error
   */
  fallbackSrc?: string
  /**
   * Show loading skeleton
   */
  showSkeleton?: boolean
  /**
   * Custom blur color
   */
  blurColor?: string
}

interface AvatarProps {
  src?: string | null
  alt: string
  size?: keyof typeof AVATAR_SIZES
  fallbackText?: string
  className?: string
}

interface LogoProps {
  src: string
  alt: string
  size?: keyof typeof LOGO_SIZES
  className?: string
  priority?: boolean
}

interface CategoryImageProps {
  src: string
  alt: string
  category: 'skill' | 'agent' | 'command' | 'guide'
  width: number
  height: number
  className?: string
  priority?: boolean
}

interface ResponsiveImageProps {
  src: string
  alt: string
  aspectRatio?: number
  className?: string
  containerClassName?: string
  priority?: boolean
  fill?: boolean
}

// ============================================================================
// OptimizedImage Component
// ============================================================================

/**
 * Enhanced Image component with automatic optimization based on use case
 */
export function OptimizedImage({
  useCase = 'card',
  placeholder = 'blur',
  category,
  gradientColors,
  fallbackSrc,
  showSkeleton = true,
  blurColor,
  src,
  alt,
  className = '',
  onError,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [currentSrc, setCurrentSrc] = useState(src)

  // Get optimization config for use case
  const config = useMemo(() => getOptimizationConfig(useCase), [useCase])

  // Generate placeholder based on type
  const placeholderData = useMemo(() => {
    if (placeholder === 'empty' || placeholder === undefined) {
      return undefined
    }

    if (placeholder === 'category' && category) {
      const color = getCategoryPlaceholderColor(category)
      return generateBlurPlaceholder(color)
    }

    if (placeholder === 'gradient' && gradientColors) {
      return generateGradientPlaceholder(gradientColors)
    }

    // Default blur
    const color = blurColor || '#e5e7eb'
    return generateBlurPlaceholder(color)
  }, [placeholder, category, gradientColors, blurColor])

  const handleLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (fallbackSrc && currentSrc !== fallbackSrc) {
        setCurrentSrc(fallbackSrc)
        setHasError(false)
      } else {
        setHasError(true)
      }
      onError?.(e)
    },
    [fallbackSrc, currentSrc, onError]
  )

  // Don't render if error and no fallback
  if (hasError && !fallbackSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-muted)] ${className}`}
        style={{ width: props.width, height: props.height }}
      >
        <svg
          className="w-1/3 h-1/3 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    )
  }

  const shouldUnoptimize = isSvgUrl(String(currentSrc)) || config.unoptimized

  return (
    <div className={`relative ${showSkeleton && isLoading ? 'overflow-hidden' : ''}`}>
      {showSkeleton && isLoading && (
        <div
          className="absolute inset-0 bg-[var(--bg-secondary)] animate-pulse"
          aria-hidden="true"
        />
      )}
      <Image
        src={currentSrc}
        alt={alt}
        className={`transition-opacity duration-300 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        } ${className}`}
        quality={config.quality}
        priority={config.priority}
        loading={config.loading}
        sizes={props.sizes || config.sizes}
        placeholder={placeholderData ? 'blur' : 'empty'}
        blurDataURL={placeholderData?.blurDataURL}
        unoptimized={shouldUnoptimize}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  )
}

// ============================================================================
// Avatar Component
// ============================================================================

/**
 * Optimized avatar component with fallback
 */
export function Avatar({
  src,
  alt,
  size = 'md',
  fallbackText,
  className = '',
}: AvatarProps) {
  const [hasError, setHasError] = useState(false)
  const dimension = AVATAR_SIZES[size]

  // Show fallback if no src or error
  if (!src || hasError) {
    const initial = fallbackText?.[0]?.toUpperCase() || alt[0]?.toUpperCase() || '?'

    return (
      <div
        className={`flex items-center justify-center rounded-full bg-[var(--accent-cyan)] text-black font-medium ${className}`}
        style={{ width: dimension, height: dimension }}
        aria-label={alt}
      >
        <span style={{ fontSize: dimension * 0.4 }}>{initial}</span>
      </div>
    )
  }

  const isExternal = isExternalUrl(src)

  return (
    <Image
      src={src}
      alt={alt}
      width={dimension}
      height={dimension}
      className={`rounded-full object-cover ${className}`}
      unoptimized={isExternal}
      onError={() => setHasError(true)}
    />
  )
}

// ============================================================================
// Logo Component
// ============================================================================

/**
 * Optimized logo component
 */
export function Logo({
  src,
  alt,
  size = 'md',
  className = '',
  priority = false,
}: LogoProps) {
  const dimensions = LOGO_SIZES[size]

  return (
    <Image
      src={src}
      alt={alt}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      priority={priority}
      unoptimized={isSvgUrl(src)}
    />
  )
}

// ============================================================================
// CategoryImage Component
// ============================================================================

/**
 * Image with category-based placeholder
 */
export function CategoryImage({
  src,
  alt,
  category,
  width,
  height,
  className = '',
  priority = false,
}: CategoryImageProps) {
  const placeholderColor = getCategoryPlaceholderColor(category)
  const placeholder = generateBlurPlaceholder(placeholderColor)

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      placeholder="blur"
      blurDataURL={placeholder.blurDataURL}
    />
  )
}

// ============================================================================
// ResponsiveImage Component
// ============================================================================

/**
 * Fully responsive image with proper sizing
 */
export function ResponsiveImage({
  src,
  alt,
  aspectRatio,
  className = '',
  containerClassName = '',
  priority = false,
  fill = true,
}: ResponsiveImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const sizes = useMemo(() => generateSizes(), [])
  const placeholder = useMemo(() => generateBlurPlaceholder(), [])

  const containerStyle = aspectRatio
    ? { paddingBottom: `${(1 / aspectRatio) * 100}%` }
    : undefined

  if (fill) {
    return (
      <div
        className={`relative overflow-hidden ${containerClassName}`}
        style={containerStyle}
      >
        {isLoading && (
          <div
            className="absolute inset-0 bg-[var(--bg-secondary)] animate-pulse"
            aria-hidden="true"
          />
        )}
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={`object-cover transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          } ${className}`}
          priority={priority}
          placeholder="blur"
          blurDataURL={placeholder.blurDataURL}
          onLoad={() => setIsLoading(false)}
        />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={aspectRatio ? Math.round(1200 / aspectRatio) : 800}
      sizes={sizes}
      className={className}
      priority={priority}
      placeholder="blur"
      blurDataURL={placeholder.blurDataURL}
    />
  )
}

// ============================================================================
// ImageWithSkeleton Component
// ============================================================================

interface ImageWithSkeletonProps extends Omit<ImageProps, 'onLoad'> {
  skeletonClassName?: string
}

/**
 * Image with loading skeleton
 */
export function ImageWithSkeleton({
  skeletonClassName = '',
  className = '',
  ...props
}: ImageWithSkeletonProps) {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="relative">
      {isLoading && (
        <div
          className={`absolute inset-0 bg-[var(--bg-secondary)] animate-pulse rounded ${skeletonClassName}`}
          aria-hidden="true"
        />
      )}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt is passed via props spread */}
      <Image
        {...props}
        className={`transition-opacity duration-300 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        } ${className}`}
        onLoad={() => setIsLoading(false)}
      />
    </div>
  )
}

// ============================================================================
// LazyImage Component
// ============================================================================

interface LazyImageProps extends ImageProps {
  threshold?: number
  rootMargin?: string
}

/**
 * Image with intersection observer for deferred loading
 */
export function LazyImage({
  threshold = 0.1,
  rootMargin = '50px',
  ...props
}: LazyImageProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
        setIsVisible(true)
        return
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.disconnect()
          }
        },
        { threshold, rootMargin }
      )

      observer.observe(node)

      return () => observer.disconnect()
    },
    [threshold, rootMargin]
  )

  const placeholder = useMemo(() => generateBlurPlaceholder(), [])

  return (
    <div ref={containerRef} className="relative">
      {!hasLoaded && (
        <div
          className="absolute inset-0 bg-[var(--bg-secondary)] animate-pulse"
          style={{
            width: typeof props.width === 'number' ? props.width : 'auto',
            height: typeof props.height === 'number' ? props.height : 'auto',
          }}
          aria-hidden="true"
        />
      )}
      {isVisible && (
        // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed via props spread
        <Image
          {...props}
          placeholder="blur"
          blurDataURL={placeholder.blurDataURL}
          loading="lazy"
          onLoad={() => setHasLoaded(true)}
          className={`transition-opacity duration-300 ${
            hasLoaded ? 'opacity-100' : 'opacity-0'
          } ${props.className || ''}`}
        />
      )}
    </div>
  )
}

// ============================================================================
// OGImage Component (for metadata)
// ============================================================================

interface OGImageProps {
  title: string
  description?: string
  type?: 'skill' | 'agent' | 'command' | 'guide'
}

/**
 * Generate OG image metadata (for use in generateMetadata)
 */
export function getOGImageMetadata({ title, description: _description, type }: OGImageProps) {
  const typeColors: Record<string, string> = {
    skill: '6366f1',
    agent: '10b981',
    command: 'f59e0b',
    guide: '3b82f6',
  }

  // bgColor is available for future dynamic OG image generation
  const _bgColor = type ? typeColors[type] : '1f2937'

  // Using a placeholder service for dynamic OG images
  // In production, you might want to use @vercel/og or similar
  return {
    url: `/og-image.png`,
    width: 1200,
    height: 630,
    alt: title,
    type: 'image/png',
  }
}
