import * as fs from "node:fs"
import * as path from "node:path"
import {
  gptersConfigSchema,
  DEFAULT_CONFIG,
  type GptersConfig,
} from "./schema"
import { createLogger } from "../utils/logger"

const logger = createLogger("gpters-config")

const CONFIG_FILENAME = "gpters.json"

export class GptersConfigManager {
  private static instances = new Map<string, GptersConfigManager>()

  private cachedConfig: GptersConfig | null = null
  private readonly configPath: string

  private constructor(directory: string) {
    this.configPath = path.join(directory, CONFIG_FILENAME)
  }

  static getInstance(directory: string): GptersConfigManager {
    const normalized = path.resolve(directory)

    if (!this.instances.has(normalized)) {
      this.instances.set(normalized, new GptersConfigManager(normalized))
    }

    return this.instances.get(normalized)!
  }

  static clearInstances(): void {
    this.instances.clear()
  }

  exists(): boolean {
    return fs.existsSync(this.configPath)
  }

  read(): GptersConfig {
    if (this.cachedConfig) {
      return this.cachedConfig
    }

    if (!this.exists()) {
      return { ...DEFAULT_CONFIG }
    }

    try {
      const content = fs.readFileSync(this.configPath, "utf-8")
      const parsed = JSON.parse(content)
      const validated = gptersConfigSchema.parse(parsed)
      this.cachedConfig = validated
      return validated
    } catch (error) {
      logger.warn(`Failed to read config, using defaults: ${error}`)
      return { ...DEFAULT_CONFIG }
    }
  }

  write(updates: Partial<Omit<GptersConfig, "version">>): void {
    const current = this.read()
    const merged: GptersConfig = {
      ...current,
      ...updates,
      version: 1,
    }

    const validated = gptersConfigSchema.parse(merged)

    fs.writeFileSync(this.configPath, JSON.stringify(validated, null, 2) + "\n")
    this.cachedConfig = validated
  }

  invalidateCache(): void {
    this.cachedConfig = null
  }

  getPreferPlanMode(): boolean {
    return false
  }

  setPreferPlanMode(value: boolean): void {
    this.write({ preferPlanMode: value })
  }

  getAutoCommit(): boolean {
    // const config = this.read()
    // return config.autoCommit ?? true
    return false
  }

  setAutoCommit(value: boolean): void {
    this.write({ autoCommit: value })
  }

  getConfigPath(): string {
    return this.configPath
  }
}
