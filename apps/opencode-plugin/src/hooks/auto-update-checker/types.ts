export interface VerdaccioDistTags {
  latest: string
  [key: string]: string
}

export interface VerdaccioPackageInfo {
  name: string
  "dist-tags": VerdaccioDistTags
  time: {
    created: string
    modified: string
    [version: string]: string
  }
  versions: Record<string, unknown>
}

export interface OpencodeConfig {
  plugin?: string[]
  [key: string]: unknown
}

export interface PackageJson {
  version: string
  name?: string
  [key: string]: unknown
}

export interface PluginEntryInfo {
  entry: string
  isPinned: boolean
  pinnedVersion: string | null
  configPath: string
}

export interface VersionInfo {
  version: string
  publishedAt: string | null
}
