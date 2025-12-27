/**
 * Environment variable validation and type-safe access
 *
 * Validates required environment variables at build time and provides
 * type-safe access throughout the application.
 */

import { createLogger } from './logger'

const log = createLogger('env')

// Environment variable schema
const envSchema = {
  // Database (required)
  DATABASE_URL: {
    required: true,
    description: 'Neon PostgreSQL connection string',
  },

  // Authentication (required for production)
  GOOGLE_CLIENT_ID: {
    required: process.env.NODE_ENV === 'production',
    description: 'Google OAuth client ID',
  },
  GOOGLE_CLIENT_SECRET: {
    required: process.env.NODE_ENV === 'production',
    description: 'Google OAuth client secret',
  },
  NEXTAUTH_SECRET: {
    required: process.env.NODE_ENV === 'production',
    description: 'NextAuth.js secret for session encryption',
  },
  NEXTAUTH_URL: {
    required: false,
    description: 'NextAuth.js URL (auto-detected in Vercel)',
  },

  // Admin (required)
  ADMIN_PASSWORD: {
    required: true,
    description: 'Admin dashboard password',
  },

  // GitHub API (optional, for marketplace sync)
  GH_TOKEN: {
    required: false,
    description: 'GitHub personal access token for marketplace sync',
  },
  GH_OWNER: {
    required: false,
    description: 'GitHub repository owner',
  },
  GH_REPO: {
    required: false,
    description: 'GitHub repository name',
  },
  GH_BRANCH: {
    required: false,
    description: 'GitHub branch for marketplace sync',
  },

  // Development
  DEV_BYPASS_AUTH: {
    required: false,
    description: 'Bypass authentication in development (set to "true")',
  },

  // Logging
  LOG_LEVEL: {
    required: false,
    description: 'Logging level (debug, info, warn, error)',
  },
} as const

type EnvKey = keyof typeof envSchema

interface ValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Validate all environment variables
 */
export function validateEnv(): ValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  for (const [key, config] of Object.entries(envSchema)) {
    const value = process.env[key]

    if (config.required && !value) {
      missing.push(`${key}: ${config.description}`)
    } else if (!value && key.startsWith('GH_')) {
      // Check if any GH_ vars are set but incomplete
      const ghVars = ['GH_TOKEN', 'GH_OWNER', 'GH_REPO', 'GH_BRANCH']
      const hasAnyGh = ghVars.some(v => process.env[v])
      if (hasAnyGh) {
        warnings.push(`${key} is not set but other GitHub variables are configured`)
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Get a required environment variable (throws if missing)
 */
export function getRequiredEnv(key: EnvKey): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

/**
 * Get an optional environment variable with default
 */
export function getEnv(key: EnvKey, defaultValue: string = ''): string {
  return process.env[key] || defaultValue
}

/**
 * Get boolean environment variable
 */
export function getBoolEnv(key: EnvKey, defaultValue: boolean = false): boolean {
  const value = process.env[key]
  if (!value) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * Check if running in production mode
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Check if auth bypass is enabled (development only)
 */
export function isAuthBypassed(): boolean {
  return isDev() && getBoolEnv('DEV_BYPASS_AUTH')
}

/**
 * Validate environment on module load (in development)
 */
if (process.env.NODE_ENV === 'development') {
  const result = validateEnv()

  if (!result.valid) {
    log.error('Missing required environment variables', undefined, {
      missing: result.missing,
    })
    console.error('\n⚠️  Missing required environment variables:')
    result.missing.forEach(m => console.error(`   - ${m}`))
    console.error('\nSee .env.example for required variables.\n')
  }

  if (result.warnings.length > 0) {
    result.warnings.forEach(w => log.warn(w))
  }
}

// Type-safe environment access
export const env = {
  DATABASE_URL: () => getRequiredEnv('DATABASE_URL'),
  ADMIN_PASSWORD: () => getRequiredEnv('ADMIN_PASSWORD'),
  GOOGLE_CLIENT_ID: () => getEnv('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: () => getEnv('GOOGLE_CLIENT_SECRET'),
  NEXTAUTH_SECRET: () => getEnv('NEXTAUTH_SECRET'),
  NEXTAUTH_URL: () => getEnv('NEXTAUTH_URL'),
  GH_TOKEN: () => getEnv('GH_TOKEN'),
  GH_OWNER: () => getEnv('GH_OWNER'),
  GH_REPO: () => getEnv('GH_REPO'),
  GH_BRANCH: () => getEnv('GH_BRANCH'),
  DEV_BYPASS_AUTH: () => getBoolEnv('DEV_BYPASS_AUTH'),
  LOG_LEVEL: () => getEnv('LOG_LEVEL', 'info'),
  isDev,
  isProd,
  isAuthBypassed,
}
