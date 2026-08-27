/**
 * aitk config subcommand — view or change settings
 *
 * - aitk config list          : show all settings
 * - aitk config get <key>     : get a specific key
 * - aitk config set <key> <v> : set a specific key
 */

import { readConfig, writeConfig, CONFIGURABLE_KEYS, type AitkConfig } from '../config.js'
import { error, info } from '../output.js'

/**
 * Print all settings
 */
function listConfig(): void {
  const config = readConfig()
  const output: Record<string, string> = {
    searchMethod: config.searchMethod ?? 'auto',
    serverUrl: config.serverUrl,
  }
  console.log(JSON.stringify(output, null, 2))
}

/**
 * Get a specific config key
 *
 * @param key - config key to read
 */
function getConfig(key: string): void {
  if (!(key in CONFIGURABLE_KEYS)) {
    error(`Unknown key: ${key}\nAvailable keys: ${Object.keys(CONFIGURABLE_KEYS).join(', ')}`)
  }
  const config = readConfig()
  const value = config[key as keyof AitkConfig] ?? (key === 'searchMethod' ? 'auto' : undefined)
  console.log(JSON.stringify({ [key]: value }))
}

/**
 * Set a specific config key
 *
 * @param key - config key to set
 * @param value - new value
 */
function setConfig(key: string, value: string): void {
  const meta = CONFIGURABLE_KEYS[key]
  if (!meta) {
    error(`Unknown key: ${key}\nAvailable keys: ${Object.keys(CONFIGURABLE_KEYS).join(', ')}`)
  }
  if (meta.values && !meta.values.includes(value)) {
    error(`Invalid value: ${value}\nAllowed values: ${meta.values.join(', ')}`)
  }

  const config = readConfig()
  ;(config as unknown as Record<string, unknown>)[key] = value
  writeConfig(config)

  info(`${key} = ${value}`)
  console.log(JSON.stringify({ [key]: value, updated: true }))
}

/**
 * Run config subcommand
 *
 * @param subcommand - list | get | set
 * @param args - additional arguments (key, value)
 */
export function runConfig(subcommand: string | undefined, args: string[]): void {
  switch (subcommand) {
    case 'list':
    case undefined:
      listConfig()
      break
    case 'get': {
      const key = args[0]
      if (!key) error('Key required: aitk config get <key>')
      getConfig(key)
      break
    }
    case 'set': {
      const key = args[0]
      const value = args[1]
      if (!key || !value) error('Key and value required: aitk config set <key> <value>')
      setConfig(key, value)
      break
    }
    default:
      error(`Unknown config subcommand: ${subcommand}\nUsage: aitk config [list|get|set] [key] [value]`)
  }
}
