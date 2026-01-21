/**
 * Logging utility for GPTers OpenCode Plugin
 *
 * Features:
 * - File-based logging for debugging (temp directory)
 * - Console output with module prefix
 * - Log level filtering via GPTERS_LOG_LEVEL env var
 * - Silent fail on file write errors (non-blocking)
 */

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

type LogLevel = "debug" | "info" | "warn" | "error"

const LOG_FILE = path.join(os.tmpdir(), "gpters-opencode-plugin.log")

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLogLevel(): LogLevel {
  const envLevel = process.env.GPTERS_LOG_LEVEL as LogLevel | undefined
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
    return envLevel
  }
  return "info"
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLogLevel()]
}

function writeToFile(entry: string): void {
  try {
    fs.appendFileSync(LOG_FILE, entry)
  } catch {
    // Silent fail - file write errors should not affect plugin operation
  }
}

function formatEntry(
  level: LogLevel,
  prefix: string,
  message: string,
  data?: unknown
): string {
  const timestamp = new Date().toISOString()
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : ""
  return `[${timestamp}] [${level.toUpperCase()}] [${prefix}] ${message}${dataStr}\n`
}

interface LoggerInstance {
  debug: (message: string, data?: unknown) => void
  info: (message: string, data?: unknown) => void
  warn: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
}

interface LoggerOptions {
  /** Enable file logging (default: true) */
  enableFileLog?: boolean
  /** Enable console output (default: true) */
  enableConsole?: boolean
}

/**
 * Create a logger instance with a specific module prefix
 *
 * @example
 * const logger = createLogger("gpters-plugin")
 * logger.info("Plugin started")
 * logger.error("Failed to load config", { path: "/path/to/config" })
 */
export function createLogger(
  prefix: string,
  options: LoggerOptions = {}
): LoggerInstance {
  const { enableFileLog = true, enableConsole = true } = options

  function log(level: LogLevel, message: string, data?: unknown): void {
    if (!shouldLog(level)) return

    const entry = formatEntry(level, prefix, message, data)

    if (enableFileLog) {
      writeToFile(entry)
    }

    if (enableConsole) {
      const consoleMsg = `[${prefix}] ${message}`

      switch (level) {
        case "error":
          if (data !== undefined) {
            console.error(consoleMsg, data)
          } else {
            console.error(consoleMsg)
          }
          break
        case "warn":
          if (data !== undefined) {
            console.warn(consoleMsg, data)
          } else {
            console.warn(consoleMsg)
          }
          break
        default:
          if (data !== undefined) {
            console.log(consoleMsg, data)
          } else {
            console.log(consoleMsg)
          }
      }
    }
  }

  return {
    debug: (message: string, data?: unknown) => log("debug", message, data),
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
  }
}

/**
 * Get the path to the log file for debugging
 *
 * @example
 * console.log("Log file:", getLogFilePath())
 * // macOS/Linux: /tmp/gpters-opencode-plugin.log
 * // Windows: %TEMP%\gpters-opencode-plugin.log
 */
export function getLogFilePath(): string {
  return LOG_FILE
}

export type { LogLevel, LoggerInstance, LoggerOptions }
