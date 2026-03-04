import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import type { OpencodeConfig, PackageJson, PluginEntryInfo, VerdaccioPackageInfo, VersionInfo } from "./types"
import {
  PACKAGE_NAME,
  NPM_PACKAGE_URL,
  NPM_FETCH_TIMEOUT,
  INSTALLED_PACKAGE_JSON,
  USER_OPENCODE_CONFIG,
  USER_OPENCODE_CONFIG_JSONC,
  USER_CONFIG_DIR,
  getWindowsAppdataDir,
} from "./constants"
import { createLogger } from "../../utils/logger"

const logger = createLogger("gpters-plugin")

function stripJsonComments(json: string): string {
  return json
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m))
    .replace(/,(\s*[}\]])/g, "$1")
}

function getConfigPaths(directory: string): string[] {
  const paths = [
    path.join(directory, ".opencode", "opencode.json"),
    path.join(directory, ".opencode", "opencode.jsonc"),
    USER_OPENCODE_CONFIG,
    USER_OPENCODE_CONFIG_JSONC,
  ]

  if (process.platform === "win32") {
    const crossPlatformDir = path.join(os.homedir(), ".config")
    const appdataDir = getWindowsAppdataDir()

    if (appdataDir) {
      const alternateDir = USER_CONFIG_DIR === crossPlatformDir ? appdataDir : crossPlatformDir
      const alternateConfig = path.join(alternateDir, "opencode", "opencode.json")
      const alternateConfigJsonc = path.join(alternateDir, "opencode", "opencode.jsonc")

      if (!paths.includes(alternateConfig)) {
        paths.push(alternateConfig)
      }
      if (!paths.includes(alternateConfigJsonc)) {
        paths.push(alternateConfigJsonc)
      }
    }
  }

  return paths
}

export function findPluginEntry(directory: string): PluginEntryInfo | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue
      const content = fs.readFileSync(configPath, "utf-8")
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig
      const plugins = config.plugin ?? []

      for (const entry of plugins) {
        if (entry === PACKAGE_NAME) {
          return { entry, isPinned: false, pinnedVersion: null, configPath }
        }
        if (entry.startsWith(`${PACKAGE_NAME}@`)) {
          const pinnedVersion = entry.slice(PACKAGE_NAME.length + 1)
          const isPinned = pinnedVersion !== "latest"
          return { entry, isPinned, pinnedVersion: isPinned ? pinnedVersion : null, configPath }
        }
      }
    } catch {
      continue
    }
  }

  return null
}

export function getCachedVersion(): string | null {
  try {
    if (fs.existsSync(INSTALLED_PACKAGE_JSON)) {
      const content = fs.readFileSync(INSTALLED_PACKAGE_JSON, "utf-8")
      const pkg = JSON.parse(content) as PackageJson
      if (pkg.version) return pkg.version
    }
  } catch {}

  return null
}

export function updatePinnedVersion(configPath: string, oldEntry: string, newVersion: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf-8")
    const newEntry = `${PACKAGE_NAME}@${newVersion}`

    const pluginMatch = content.match(/"plugin"\s*:\s*\[/)
    if (!pluginMatch || pluginMatch.index === undefined) {
      logger.debug(`No "plugin" array found in ${configPath}`)
      return false
    }

    const startIdx = pluginMatch.index + pluginMatch[0].length
    let bracketCount = 1
    let endIdx = startIdx

    for (let i = startIdx; i < content.length && bracketCount > 0; i++) {
      if (content[i] === "[") bracketCount++
      else if (content[i] === "]") bracketCount--
      endIdx = i
    }

    const before = content.slice(0, startIdx)
    const pluginArrayContent = content.slice(startIdx, endIdx)
    const after = content.slice(endIdx)

    const escapedOldEntry = oldEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`["']${escapedOldEntry}["']`)

    if (!regex.test(pluginArrayContent)) {
      logger.debug(`Entry "${oldEntry}" not found in plugin array of ${configPath}`)
      return false
    }

    const updatedPluginArray = pluginArrayContent.replace(regex, `"${newEntry}"`)
    const updatedContent = before + updatedPluginArray + after

    if (updatedContent === content) {
      logger.debug(`No changes made to ${configPath}`)
      return false
    }

    fs.writeFileSync(configPath, updatedContent, "utf-8")
    logger.info(`Updated ${configPath}: ${oldEntry} → ${newEntry}`)
    return true
  } catch (err) {
    logger.error(`Failed to update config file ${configPath}`, err)
    return false
  }
}

export async function getLatestVersionInfo(): Promise<VersionInfo | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), NPM_FETCH_TIMEOUT)

  try {
    const headers: Record<string, string> = { Accept: "application/json" }

    const response = await fetch(NPM_PACKAGE_URL, {
      signal: controller.signal,
      headers,
    })

    if (!response.ok) {
      logger.error(`npm registry API error: ${response.status}`)
      return null
    }

    const data = (await response.json()) as VerdaccioPackageInfo
    const latestVersion = data["dist-tags"]?.latest

    if (!latestVersion) {
      logger.error("No latest version found in dist-tags")
      return null
    }

    const publishedAt = data.time?.[latestVersion] ?? null

    return { version: latestVersion, publishedAt }
  } catch (err) {
    logger.error("Failed to fetch latest version", err)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export function formatPublishDate(isoDate: string | null): string {
  if (!isoDate) return ""

  try {
    const date = new Date(isoDate)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  } catch {
    return ""
  }
}
