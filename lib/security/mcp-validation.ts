/**
 * MCP Request Validation
 *
 * Validates and sanitizes MCP API request payloads
 * to prevent SQL injection, XSS, and other attacks.
 */

import { z } from 'zod'

// Maximum request body size (1MB)
export const MAX_REQUEST_SIZE = 1024 * 1024

// Dangerous patterns to detect in input
const DANGEROUS_PATTERNS = [
  // SQL injection patterns
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b.*\b(FROM|INTO|TABLE|DATABASE)\b)/i,
  /('|")\s*(OR|AND)\s*('|")?1('|")?\s*=\s*('|")?1('|")?/i,
  /;\s*(DROP|DELETE|UPDATE|INSERT)/i,
  // Script injection
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  // Path traversal
  /\.\.\//,
  /\.\.\\/,
  // Command injection
  /[;&|`$]/,
]

// Valid plugin ID pattern (alphanumeric, hyphens, underscores)
const PLUGIN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

// Valid category values
const VALID_CATEGORIES = [
  'skill',
  'agent',
  'command',
  'guide',
  'hook',
  'plugin',
  'all',
] as const

/**
 * Zod Schemas for MCP requests
 */

// Plugin ID schema
export const pluginIdSchema = z
  .string()
  .min(1, 'Plugin ID is required')
  .max(100, 'Plugin ID is too long')
  .regex(PLUGIN_ID_PATTERN, 'Plugin ID contains invalid characters')
  .refine(
    (val) => !containsDangerousPatterns(val),
    'Plugin ID contains potentially malicious content'
  )

// Search query schema - sanitizes input, doesn't reject
// (sanitization handles XSS, dangerous pattern check is for IDs)
export const searchQuerySchema = z
  .string()
  .max(500, 'Query is too long')
  .transform((val) => sanitizeString(val))

// Category schema
export const categorySchema = z.enum(VALID_CATEGORIES).optional()

// Limit schema
export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .default(20)

// Simple REST request schemas
export const searchRequestSchema = z.object({
  query: searchQuerySchema.optional(),
  category: categorySchema,
  limit: limitSchema,
})

export const getRequestSchema = z.object({
  pluginId: pluginIdSchema,
})

export const listRequestSchema = z.object({
  category: categorySchema,
  limit: limitSchema,
})

// JSON-RPC request schema
export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.string().min(1).max(100),
  params: z.record(z.string(), z.unknown()).optional(),
})

// Tool call arguments schema
export const toolCallArgsSchema = z.object({
  query: searchQuerySchema.optional(),
  pluginId: pluginIdSchema.optional(),
  category: categorySchema,
  limit: limitSchema,
  // Deploy skill args
  skillId: pluginIdSchema.optional(),
  environment: z.enum(['development', 'production']).optional(),
  // Update check args
  installedSkills: z.array(
    z.object({
      id: pluginIdSchema,
      version: z.string().max(50).optional(),
    })
  ).max(100).optional(),
})

/**
 * Check if string contains dangerous patterns
 */
export function containsDangerousPatterns(input: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(input))
}

/**
 * Sanitize string input
 * - Trim whitespace
 * - Remove null bytes
 * - Escape HTML entities
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/\0/g, '') // Remove null bytes
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Validate and parse search request
 */
export function validateSearchRequest(body: unknown) {
  return searchRequestSchema.safeParse(body)
}

/**
 * Validate and parse get request
 */
export function validateGetRequest(body: unknown) {
  return getRequestSchema.safeParse(body)
}

/**
 * Validate and parse list request
 */
export function validateListRequest(body: unknown) {
  return listRequestSchema.safeParse(body)
}

/**
 * Validate JSON-RPC request
 */
export function validateJsonRpcRequest(body: unknown) {
  return jsonRpcRequestSchema.safeParse(body)
}

/**
 * Validate tool call arguments
 */
export function validateToolCallArgs(args: unknown) {
  return toolCallArgsSchema.safeParse(args)
}

/**
 * Check request body size
 */
export function isRequestSizeValid(contentLength: number | null): boolean {
  if (contentLength === null) return true // No content-length header
  return contentLength <= MAX_REQUEST_SIZE
}

/**
 * Create validation error response
 */
export function createValidationError(errors: z.core.$ZodError) {
  return {
    success: false,
    error: 'Validation failed',
    details: errors.issues.map((e) => ({
      path: e.path.map(String).join('.'),
      message: e.message,
    })),
  }
}

/**
 * Create JSON-RPC validation error
 */
export function createJsonRpcValidationError(id: unknown, errors: z.core.$ZodError) {
  return {
    jsonrpc: '2.0',
    id: typeof id === 'string' || typeof id === 'number' ? id : null,
    error: {
      code: -32602, // Invalid params
      message: 'Invalid request parameters',
      data: errors.issues.map((e) => ({
        path: e.path.map(String).join('.'),
        message: e.message,
      })),
    },
  }
}
