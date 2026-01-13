/**
 * Utility function to conditionally join class names
 * Simple implementation without external dependencies
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ')
}

// Re-export everything from utils directory
export * from './utils/index'
