/**
 * Image Optimization Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  // Format detection
  supportsWebP,
  supportsAVIF,
  getBestFormat,
  getImageFormat,
  // Responsive sizing
  generateSizes,
  generateCustomSizes,
  calculateAspectRatio,
  calculateDimensions,
  getOptimalImageWidth,
  // Blur placeholder
  generateBlurPlaceholder,
  generateGradientPlaceholder,
  getCategoryPlaceholderColor,
  // Optimization config
  getOptimizationConfig,
  // URL utilities
  buildImageUrl,
  isExternalUrl,
  isDataUrl,
  isSvgUrl,
  // Srcset
  generateSrcset,
  generateRetinaSrcset,
  // Validation
  validateDimensions,
  getOgImageRecommendation,
  // Constants
  DEFAULT_BREAKPOINTS,
  SRCSET_WIDTHS,
  AVATAR_SIZES,
  LOGO_SIZES,
  OG_IMAGE_SIZES,
  QUALITY_PRESETS,
} from '@/lib/image-optimization'

// ============================================================================
// Format Detection Tests
// ============================================================================

describe('Format Detection', () => {
  describe('getImageFormat', () => {
    it('should detect JPEG format', () => {
      expect(getImageFormat('/images/photo.jpg')).toBe('jpeg')
      expect(getImageFormat('/images/photo.jpeg')).toBe('jpeg')
    })

    it('should detect PNG format', () => {
      expect(getImageFormat('/images/logo.png')).toBe('png')
    })

    it('should detect WebP format', () => {
      expect(getImageFormat('/images/modern.webp')).toBe('webp')
    })

    it('should detect AVIF format', () => {
      expect(getImageFormat('/images/ultra.avif')).toBe('avif')
    })

    it('should detect SVG format', () => {
      expect(getImageFormat('/images/icon.svg')).toBe('svg+xml')
    })

    it('should detect GIF format', () => {
      expect(getImageFormat('/images/animation.gif')).toBe('gif')
    })

    it('should return unknown for unrecognized formats', () => {
      expect(getImageFormat('/images/file.xyz')).toBe('unknown')
      expect(getImageFormat('/images/noextension')).toBe('unknown')
    })

    it('should handle URLs with query strings', () => {
      expect(getImageFormat('/images/photo.jpg?v=123')).toBe('unknown') // Extension detection is simple
    })
  })

  describe('supportsWebP', () => {
    it('should return boolean', () => {
      // In jsdom environment, canvas.toDataURL may not support webp
      const result = supportsWebP()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('supportsAVIF', () => {
    it('should return boolean', () => {
      // In jsdom environment, canvas.toDataURL may not support avif
      const result = supportsAVIF()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('getBestFormat', () => {
    it('should return a valid format', () => {
      const format = getBestFormat()
      expect(['avif', 'webp', 'png']).toContain(format)
    })
  })
})

// ============================================================================
// Responsive Sizing Tests
// ============================================================================

describe('Responsive Sizing', () => {
  describe('generateSizes', () => {
    it('should generate sizes string from default breakpoints', () => {
      const sizes = generateSizes()
      expect(sizes).toContain('(max-width: 639px) 640px')
      expect(sizes).toContain('(max-width: 1023px) 768px')
      expect(sizes).toContain('1536px') // Default size
    })

    it('should generate sizes from custom breakpoints', () => {
      const customBreakpoints = [
        { name: 'small', minWidth: 0, maxWidth: 500, imageWidth: 400 },
        { name: 'large', minWidth: 501, maxWidth: Infinity, imageWidth: 1000 },
      ]
      const sizes = generateSizes(customBreakpoints)
      expect(sizes).toContain('(max-width: 500px) 400px')
      expect(sizes).toContain('1000px')
    })
  })

  describe('generateCustomSizes', () => {
    it('should generate custom sizes config', () => {
      const config = {
        default: '50vw',
        breakpoints: [
          { name: 'mobile', minWidth: 0, maxWidth: 640, imageWidth: 100 },
        ],
      }
      const sizes = generateCustomSizes(config)
      expect(sizes).toContain('(max-width: 640px) 100px')
      expect(sizes).toContain('50vw')
    })
  })

  describe('calculateAspectRatio', () => {
    it('should calculate aspect ratio correctly', () => {
      expect(calculateAspectRatio(1920, 1080)).toBeCloseTo(1.778, 2)
      expect(calculateAspectRatio(1200, 630)).toBeCloseTo(1.905, 2)
      expect(calculateAspectRatio(100, 100)).toBe(1)
    })

    it('should handle 16:9 aspect ratio', () => {
      expect(calculateAspectRatio(16, 9)).toBeCloseTo(1.778, 2)
    })

    it('should handle 4:3 aspect ratio', () => {
      expect(calculateAspectRatio(4, 3)).toBeCloseTo(1.333, 2)
    })
  })

  describe('calculateDimensions', () => {
    it('should maintain aspect ratio when only width is provided', () => {
      const dims = calculateDimensions(1920, 1080, 960)
      expect(dims.width).toBe(960)
      expect(dims.height).toBe(540)
    })

    it('should maintain aspect ratio when only height is provided', () => {
      const dims = calculateDimensions(1920, 1080, undefined, 540)
      expect(dims.width).toBe(960)
      expect(dims.height).toBe(540)
    })

    it('should return target dimensions when both are provided', () => {
      const dims = calculateDimensions(1920, 1080, 800, 600)
      expect(dims.width).toBe(800)
      expect(dims.height).toBe(600)
    })

    it('should return original dimensions when no target is provided', () => {
      const dims = calculateDimensions(1920, 1080)
      expect(dims.width).toBe(1920)
      expect(dims.height).toBe(1080)
    })
  })

  describe('getOptimalImageWidth', () => {
    it('should return a valid image width', () => {
      // In jsdom environment, returns width based on window.innerWidth
      const result = getOptimalImageWidth()
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThan(0)
    })
  })
})

// ============================================================================
// Blur Placeholder Tests
// ============================================================================

describe('Blur Placeholder', () => {
  describe('generateBlurPlaceholder', () => {
    it('should generate valid data URL', () => {
      const placeholder = generateBlurPlaceholder()
      expect(placeholder.blurDataURL).toMatch(/^data:image\/svg\+xml;base64,/)
    })

    it('should use default gray color', () => {
      const placeholder = generateBlurPlaceholder()
      expect(placeholder.width).toBe(8)
      expect(placeholder.height).toBe(8)
    })

    it('should use custom color', () => {
      const placeholder = generateBlurPlaceholder('#ff0000')
      expect(placeholder.blurDataURL).toContain('base64')
    })

    it('should use custom dimensions', () => {
      const placeholder = generateBlurPlaceholder('#000000', 16, 16)
      expect(placeholder.width).toBe(16)
      expect(placeholder.height).toBe(16)
    })
  })

  describe('generateGradientPlaceholder', () => {
    it('should generate valid gradient data URL', () => {
      const placeholder = generateGradientPlaceholder()
      expect(placeholder.blurDataURL).toMatch(/^data:image\/svg\+xml;base64,/)
    })

    it('should use custom gradient colors', () => {
      const placeholder = generateGradientPlaceholder(['#ff0000', '#0000ff'])
      expect(placeholder.blurDataURL).toContain('base64')
    })
  })

  describe('getCategoryPlaceholderColor', () => {
    it('should return indigo for skill', () => {
      expect(getCategoryPlaceholderColor('skill')).toBe('#6366f1')
    })

    it('should return emerald for agent', () => {
      expect(getCategoryPlaceholderColor('agent')).toBe('#10b981')
    })

    it('should return amber for command', () => {
      expect(getCategoryPlaceholderColor('command')).toBe('#f59e0b')
    })

    it('should return blue for guide', () => {
      expect(getCategoryPlaceholderColor('guide')).toBe('#3b82f6')
    })

    it('should return gray for unknown category', () => {
      expect(getCategoryPlaceholderColor('unknown')).toBe('#6b7280')
    })
  })
})

// ============================================================================
// Optimization Config Tests
// ============================================================================

describe('Optimization Config', () => {
  describe('getOptimizationConfig', () => {
    it('should return hero config', () => {
      const config = getOptimizationConfig('hero')
      expect(config.priority).toBe(true)
      expect(config.loading).toBe('eager')
      expect(config.quality).toBe(QUALITY_PRESETS.high)
    })

    it('should return card config', () => {
      const config = getOptimizationConfig('card')
      expect(config.priority).toBe(false)
      expect(config.loading).toBe('lazy')
      expect(config.quality).toBe(QUALITY_PRESETS.medium)
    })

    it('should return thumbnail config', () => {
      const config = getOptimizationConfig('thumbnail')
      expect(config.quality).toBe(QUALITY_PRESETS.low)
      expect(config.loading).toBe('lazy')
    })

    it('should return avatar config', () => {
      const config = getOptimizationConfig('avatar')
      expect(config.placeholder).toBe('empty')
      expect(config.sizes).toBe('64px')
    })

    it('should return og config', () => {
      const config = getOptimizationConfig('og')
      expect(config.priority).toBe(true)
      expect(config.sizes).toBe('1200px')
    })

    it('should return logo config', () => {
      const config = getOptimizationConfig('logo')
      expect(config.quality).toBe(QUALITY_PRESETS.maximum)
      expect(config.priority).toBe(true)
    })

    it('should return background config', () => {
      const config = getOptimizationConfig('background')
      expect(config.placeholder).toBe('blur')
      expect(config.sizes).toBe('100vw')
    })
  })
})

// ============================================================================
// URL Utilities Tests
// ============================================================================

describe('URL Utilities', () => {
  describe('buildImageUrl', () => {
    it('should add width parameter', () => {
      const url = buildImageUrl('/image.jpg', { width: 800 })
      expect(url).toBe('/image.jpg?w=800')
    })

    it('should add multiple parameters', () => {
      const url = buildImageUrl('/image.jpg', { width: 800, height: 600, quality: 80 })
      expect(url).toContain('w=800')
      expect(url).toContain('h=600')
      expect(url).toContain('q=80')
    })

    it('should return original URL when no params', () => {
      const url = buildImageUrl('/image.jpg', {})
      expect(url).toBe('/image.jpg')
    })
  })

  describe('isExternalUrl', () => {
    it('should detect external URLs', () => {
      expect(isExternalUrl('https://example.com/image.jpg')).toBe(true)
      expect(isExternalUrl('http://cdn.example.com/image.jpg')).toBe(true)
    })

    it('should detect internal URLs', () => {
      expect(isExternalUrl('/images/photo.jpg')).toBe(false)
      expect(isExternalUrl('./image.jpg')).toBe(false)
      expect(isExternalUrl('image.jpg')).toBe(false)
    })
  })

  describe('isDataUrl', () => {
    it('should detect data URLs', () => {
      expect(isDataUrl('data:image/png;base64,abc123')).toBe(true)
      expect(isDataUrl('data:image/svg+xml,<svg></svg>')).toBe(true)
    })

    it('should return false for non-data URLs', () => {
      expect(isDataUrl('/image.png')).toBe(false)
      expect(isDataUrl('https://example.com/image.png')).toBe(false)
    })
  })

  describe('isSvgUrl', () => {
    it('should detect SVG URLs', () => {
      expect(isSvgUrl('/icons/logo.svg')).toBe(true)
      expect(isSvgUrl('/icons/logo.svg?v=1')).toBe(true)
    })

    it('should return false for non-SVG URLs', () => {
      expect(isSvgUrl('/image.png')).toBe(false)
      expect(isSvgUrl('/image.jpg')).toBe(false)
    })
  })
})

// ============================================================================
// Srcset Generation Tests
// ============================================================================

describe('Srcset Generation', () => {
  describe('generateSrcset', () => {
    it('should generate srcset with default widths', () => {
      const srcset = generateSrcset('/image.jpg')
      expect(srcset).toContain('640w')
      expect(srcset).toContain('1080w')
      expect(srcset).toContain('1920w')
    })

    it('should generate srcset with custom widths', () => {
      const srcset = generateSrcset('/image.jpg', [100, 200, 300])
      expect(srcset).toBe('/image.jpg?w=100 100w, /image.jpg?w=200 200w, /image.jpg?w=300 300w')
    })

    it('should return empty string for data URLs', () => {
      const srcset = generateSrcset('data:image/png;base64,abc')
      expect(srcset).toBe('')
    })

    it('should return empty string for SVG URLs', () => {
      const srcset = generateSrcset('/icon.svg')
      expect(srcset).toBe('')
    })
  })

  describe('generateRetinaSrcset', () => {
    it('should generate 1x, 2x, 3x srcset', () => {
      const srcset = generateRetinaSrcset('/image.jpg', 100)
      expect(srcset).toContain('1x')
      expect(srcset).toContain('2x')
      expect(srcset).toContain('3x')
      expect(srcset).toContain('w=100')
      expect(srcset).toContain('w=200')
      expect(srcset).toContain('w=300')
    })
  })
})

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation', () => {
  describe('validateDimensions', () => {
    it('should pass valid dimensions', () => {
      const result = validateDimensions(1200, 630)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail when width below minimum', () => {
      const result = validateDimensions(50, 100, { minWidth: 100 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Width 50 is below minimum 100')
    })

    it('should fail when width above maximum', () => {
      const result = validateDimensions(5000, 100, { maxWidth: 4000 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Width 5000 exceeds maximum 4000')
    })

    it('should fail when height below minimum', () => {
      const result = validateDimensions(100, 50, { minHeight: 100 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Height 50 is below minimum 100')
    })

    it('should fail when height above maximum', () => {
      const result = validateDimensions(100, 5000, { maxHeight: 4000 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Height 5000 exceeds maximum 4000')
    })

    it('should validate aspect ratio', () => {
      const result = validateDimensions(1600, 900, { aspectRatio: 16 / 9 })
      expect(result.valid).toBe(true)
    })

    it('should fail invalid aspect ratio', () => {
      const result = validateDimensions(1200, 800, { aspectRatio: 16 / 9, aspectRatioTolerance: 0.01 })
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('Aspect ratio')
    })

    it('should collect multiple errors', () => {
      const result = validateDimensions(50, 50, { minWidth: 100, minHeight: 100 })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
    })
  })

  describe('getOgImageRecommendation', () => {
    it('should return Facebook OG dimensions', () => {
      const rec = getOgImageRecommendation('facebook')
      expect(rec.width).toBe(1200)
      expect(rec.height).toBe(630)
      expect(rec.aspectRatio).toBeCloseTo(1.905, 2)
    })

    it('should return Twitter OG dimensions', () => {
      const rec = getOgImageRecommendation('twitter')
      expect(rec.width).toBe(1200)
      expect(rec.height).toBe(600)
    })

    it('should return LinkedIn OG dimensions', () => {
      const rec = getOgImageRecommendation('linkedin')
      expect(rec.width).toBe(1200)
      expect(rec.height).toBe(627)
    })
  })
})

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  describe('DEFAULT_BREAKPOINTS', () => {
    it('should have 5 breakpoints', () => {
      expect(DEFAULT_BREAKPOINTS).toHaveLength(5)
    })

    it('should cover all viewport sizes', () => {
      expect(DEFAULT_BREAKPOINTS[0].minWidth).toBe(0)
      expect(DEFAULT_BREAKPOINTS[DEFAULT_BREAKPOINTS.length - 1].maxWidth).toBe(Infinity)
    })

    it('should have no gaps between breakpoints', () => {
      for (let i = 1; i < DEFAULT_BREAKPOINTS.length; i++) {
        expect(DEFAULT_BREAKPOINTS[i].minWidth).toBe(DEFAULT_BREAKPOINTS[i - 1].maxWidth + 1)
      }
    })
  })

  describe('SRCSET_WIDTHS', () => {
    it('should be sorted in ascending order', () => {
      const sorted = [...SRCSET_WIDTHS].sort((a, b) => a - b)
      expect(SRCSET_WIDTHS).toEqual(sorted)
    })

    it('should include common image widths', () => {
      expect(SRCSET_WIDTHS).toContain(640)
      expect(SRCSET_WIDTHS).toContain(1080)
      expect(SRCSET_WIDTHS).toContain(1920)
    })
  })

  describe('AVATAR_SIZES', () => {
    it('should have all size variants', () => {
      expect(AVATAR_SIZES.xs).toBe(16)
      expect(AVATAR_SIZES.sm).toBe(24)
      expect(AVATAR_SIZES.md).toBe(32)
      expect(AVATAR_SIZES.lg).toBe(48)
      expect(AVATAR_SIZES.xl).toBe(64)
      expect(AVATAR_SIZES['2xl']).toBe(96)
    })
  })

  describe('LOGO_SIZES', () => {
    it('should have all size variants', () => {
      expect(LOGO_SIZES.sm).toEqual({ width: 24, height: 24 })
      expect(LOGO_SIZES.md).toEqual({ width: 32, height: 32 })
      expect(LOGO_SIZES.lg).toEqual({ width: 48, height: 48 })
      expect(LOGO_SIZES.xl).toEqual({ width: 64, height: 64 })
    })
  })

  describe('OG_IMAGE_SIZES', () => {
    it('should have platform-specific sizes', () => {
      expect(OG_IMAGE_SIZES.facebook).toEqual({ width: 1200, height: 630 })
      expect(OG_IMAGE_SIZES.twitter).toEqual({ width: 1200, height: 600 })
      expect(OG_IMAGE_SIZES.linkedin).toEqual({ width: 1200, height: 627 })
    })
  })

  describe('QUALITY_PRESETS', () => {
    it('should have quality levels in ascending order', () => {
      expect(QUALITY_PRESETS.low).toBeLessThan(QUALITY_PRESETS.medium)
      expect(QUALITY_PRESETS.medium).toBeLessThan(QUALITY_PRESETS.high)
      expect(QUALITY_PRESETS.high).toBeLessThan(QUALITY_PRESETS.maximum)
    })

    it('should have maximum at 100', () => {
      expect(QUALITY_PRESETS.maximum).toBe(100)
    })
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('Empty and null handling', () => {
    it('should handle empty string in getImageFormat', () => {
      expect(getImageFormat('')).toBe('unknown')
    })

    it('should handle URL without extension', () => {
      expect(getImageFormat('/api/image/123')).toBe('unknown')
    })
  })

  describe('Special characters in URLs', () => {
    it('should handle spaces in buildImageUrl', () => {
      const url = buildImageUrl('/path with spaces/image.jpg', { width: 100 })
      expect(url).toContain('w=100')
    })

    it('should handle unicode in isExternalUrl', () => {
      expect(isExternalUrl('https://例え.jp/image.jpg')).toBe(true)
    })
  })

  describe('Zero dimensions', () => {
    it('should handle zero width in calculateDimensions', () => {
      const dims = calculateDimensions(0, 100)
      expect(dims.width).toBe(0)
      expect(dims.height).toBe(100)
    })

    it('should handle zero in aspect ratio calculation', () => {
      // This will return Infinity, which is technically correct
      const ratio = calculateAspectRatio(100, 0)
      expect(ratio).toBe(Infinity)
    })
  })

  describe('Very large dimensions', () => {
    it('should handle large dimensions in calculateDimensions', () => {
      const dims = calculateDimensions(10000, 5000, 2000)
      expect(dims.width).toBe(2000)
      expect(dims.height).toBe(1000)
    })

    it('should validate very large dimensions', () => {
      const result = validateDimensions(100000, 100000, { maxWidth: 8000, maxHeight: 8000 })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  it('should work together for responsive hero image', () => {
    const config = getOptimizationConfig('hero')
    const sizes = generateSizes()
    const placeholder = generateBlurPlaceholder('#1f2937')

    expect(config.priority).toBe(true)
    expect(config.sizes).toBe('100vw') // Hero config has 100vw
    expect(sizes).toContain('1536px') // Generated sizes includes default breakpoints
    expect(placeholder.blurDataURL).toMatch(/^data:image/)
  })

  it('should work together for category card', () => {
    const color = getCategoryPlaceholderColor('skill')
    const placeholder = generateBlurPlaceholder(color)
    const config = getOptimizationConfig('card')

    expect(color).toBe('#6366f1')
    expect(placeholder.blurDataURL).toContain('base64')
    expect(config.loading).toBe('lazy')
  })

  it('should generate complete srcset with sizes', () => {
    const srcset = generateSrcset('/image.jpg', [640, 1080, 1920])
    const sizes = generateSizes()

    expect(srcset).toContain('640w')
    expect(srcset).toContain('1920w')
    expect(sizes).toBeTruthy()
  })

  it('should validate OG image dimensions correctly', () => {
    const rec = getOgImageRecommendation('facebook')
    const validation = validateDimensions(rec.width, rec.height, {
      minWidth: 1200,
      minHeight: 630,
      aspectRatio: rec.aspectRatio,
    })

    expect(validation.valid).toBe(true)
  })
})
