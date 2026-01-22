import { spawn } from "node:child_process"
import { platform } from "node:os"

export async function openBrowser(url: string): Promise<boolean> {
  const os = platform()

  let cmd: string
  let args: string[]

  switch (os) {
    case "darwin":
      cmd = "open"
      args = [url]
      break
    case "win32":
      cmd = "cmd"
      args = ["/c", "start", "", url]
      break
    default:
      cmd = "xdg-open"
      args = [url]
      break
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        detached: true,
        stdio: "ignore",
      })

      child.unref()

      child.on("error", () => {
        resolve(false)
      })

      child.on("close", (code) => {
        resolve(code === 0)
      })

      const BROWSER_OPEN_TIMEOUT_MS = 1000
      setTimeout(() => {
        resolve(true)
      }, BROWSER_OPEN_TIMEOUT_MS)
    } catch {
      resolve(false)
    }
  })
}
