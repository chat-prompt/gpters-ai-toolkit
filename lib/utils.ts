/**
 * Utility function to conditionally join class names
 * Simple implementation without external dependencies
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ')
}

/**
 * Get the base URL for the application
 * Uses NEXT_PUBLIC_BASE_URL environment variable or falls back to default
 */
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-toolkit.gpters.org'
}
