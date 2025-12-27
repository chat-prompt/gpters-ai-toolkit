/**
 * Structured logging utility for GPTers AI Toolkit
 *
 * Provides consistent, structured logging with context support.
 * In development, logs to console with formatting.
 * In production, outputs JSON for log aggregation.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  module?: string
  action?: string
  userId?: string
  requestId?: string
  duration?: number
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
}

const RESET_COLOR = '\x1b[0m'

function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel()
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel]
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    }
  }
  if (error) {
    return {
      name: 'UnknownError',
      message: String(error),
    }
  }
  return undefined
}

function formatLogEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    // JSON output for log aggregation
    return JSON.stringify(entry)
  }

  // Pretty format for development
  const color = LOG_LEVEL_COLORS[entry.level]
  const levelStr = `${color}[${entry.level.toUpperCase()}]${RESET_COLOR}`
  const timeStr = new Date(entry.timestamp).toLocaleTimeString()

  let output = `${timeStr} ${levelStr} ${entry.message}`

  if (entry.context && Object.keys(entry.context).length > 0) {
    const contextStr = Object.entries(entry.context)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ')
    output += ` ${contextStr}`
  }

  if (entry.error) {
    output += `\n  Error: ${entry.error.message}`
    if (entry.error.stack) {
      output += `\n${entry.error.stack.split('\n').slice(1, 4).join('\n')}`
    }
  }

  return output
}

function log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    error: formatError(error),
  }

  const formatted = formatLogEntry(entry)

  switch (level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }
}

/**
 * Create a logger instance with a specific module context
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, context?: Omit<LogContext, 'module'>) =>
      log('debug', message, { ...context, module }),

    info: (message: string, context?: Omit<LogContext, 'module'>) =>
      log('info', message, { ...context, module }),

    warn: (message: string, context?: Omit<LogContext, 'module'>) =>
      log('warn', message, { ...context, module }),

    error: (message: string, error?: unknown, context?: Omit<LogContext, 'module'>) =>
      log('error', message, { ...context, module }, error),
  }
}

// Default logger for quick access
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) => log('error', message, context, error),
}

// Re-export types
export type { LogLevel, LogContext, LogEntry }
