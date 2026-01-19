import type { PluginInput } from "@opencode-ai/plugin"
import { getCachedVersion, findPluginEntry, getLatestVersionInfo, updatePinnedVersion, formatPublishDate } from "./checker"
import { invalidatePackage } from "./cache"
import { PACKAGE_NAME, CACHE_DIR } from "./constants"
import { spawn } from "node:child_process"

export function createAutoUpdateCheckerHook(ctx: PluginInput) {
  let hasChecked = false

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return
      if (hasChecked) return

      const props = event.properties as { info?: { parentID?: string } } | undefined
      if (props?.info?.parentID) return

      hasChecked = true

      setTimeout(async () => {
        const cachedVersion = getCachedVersion()

        showStartupToast(ctx, cachedVersion).catch(() => {})

        runBackgroundUpdateCheck(ctx).catch(err => {
          console.error("[gpters-plugin] Background update check failed:", err)
        })
      }, 0)
    },
  }
}

async function runBackgroundUpdateCheck(ctx: PluginInput): Promise<void> {
  const pluginInfo = findPluginEntry(ctx.directory)
  if (!pluginInfo) {
    console.log("[gpters-plugin] Plugin not found in config")
    return
  }

  const cachedVersion = getCachedVersion()
  const currentVersion = cachedVersion ?? pluginInfo.pinnedVersion
  if (!currentVersion) {
    console.log("[gpters-plugin] No version found (cached or pinned)")
    return
  }

  const latestInfo = await getLatestVersionInfo()
  if (!latestInfo) {
    console.log("[gpters-plugin] Failed to fetch latest version")
    return
  }

  const { version: latestVersion, publishedAt } = latestInfo

  if (currentVersion === latestVersion) {
    console.log("[gpters-plugin] Already on latest version:", latestVersion)
    return
  }

  console.log(`[gpters-plugin] Update available: ${currentVersion} → ${latestVersion}`)

  if (pluginInfo.isPinned) {
    const updated = updatePinnedVersion(pluginInfo.configPath, pluginInfo.entry, latestVersion)
    if (!updated) {
      await showUpdateAvailableToast(ctx, latestVersion, publishedAt)
      console.log("[gpters-plugin] Failed to update pinned version in config")
      return
    }
    console.log(`[gpters-plugin] Config updated: ${pluginInfo.entry} → ${PACKAGE_NAME}@${latestVersion}`)
  }

  invalidatePackage(PACKAGE_NAME)

  const installSuccess = await runBunInstall()

  if (installSuccess) {
    await showAutoUpdatedToast(ctx, currentVersion, latestVersion, publishedAt)
    console.log(`[gpters-plugin] Update installed: ${currentVersion} → ${latestVersion}`)
  } else {
    await showUpdateAvailableToast(ctx, latestVersion, publishedAt)
    console.log("[gpters-plugin] bun install failed; falling back to notification-only")
  }
}

async function runBunInstall(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn("bun", ["install"], {
        cwd: CACHE_DIR,
        stdio: "ignore",
        detached: true,
      })

      child.unref()

      child.on("close", (code) => {
        resolve(code === 0)
      })

      child.on("error", () => {
        resolve(false)
      })

      setTimeout(() => {
        resolve(false)
      }, 30000)
    } catch {
      resolve(false)
    }
  })
}

async function showStartupToast(ctx: PluginInput, version: string | null): Promise<void> {
  const displayVersion = version ?? "unknown"

  await ctx.client.tui
    .showToast({
      body: {
        title: `GPTers Plugin v${displayVersion}`,
        message: "Working with GPTers AI Toolkit",
        variant: "info" as const,
        duration: 3000,
      },
    })
    .catch(() => {})

  console.log(`[gpters-plugin] Startup toast shown: v${displayVersion}`)
}

async function showUpdateAvailableToast(
  ctx: PluginInput,
  latestVersion: string,
  publishedAt: string | null
): Promise<void> {
  const dateStr = formatPublishDate(publishedAt)
  const message = dateStr
    ? `v${latestVersion} (${dateStr}) available.\nRestart OpenCode to apply.`
    : `v${latestVersion} available.\nRestart OpenCode to apply.`

  await ctx.client.tui
    .showToast({
      body: {
        title: `GPTers Plugin Update`,
        message,
        variant: "info" as const,
        duration: 8000,
      },
    })
    .catch(() => {})

  console.log(`[gpters-plugin] Update available toast shown: v${latestVersion}`)
}

async function showAutoUpdatedToast(
  ctx: PluginInput,
  oldVersion: string,
  newVersion: string,
  publishedAt: string | null
): Promise<void> {
  const dateStr = formatPublishDate(publishedAt)
  const message = dateStr
    ? `v${oldVersion} → v${newVersion} (${dateStr})\nRestart OpenCode to apply.`
    : `v${oldVersion} → v${newVersion}\nRestart OpenCode to apply.`

  await ctx.client.tui
    .showToast({
      body: {
        title: `GPTers Plugin Updated!`,
        message,
        variant: "success" as const,
        duration: 8000,
      },
    })
    .catch(() => {})

  console.log(`[gpters-plugin] Auto-updated toast shown: v${oldVersion} → v${newVersion}`)
}
