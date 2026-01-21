import { spawn } from "node:child_process"
import { join } from "node:path"

export type DialogResult<T> = { ok: true; value: T } | { ok: false; error: string }

function getDialogPath(pluginDir: string): string {
  return join(pluginDir, "bin", "dialog")
}

function runDialog(pluginDir: string, args: string[]): Promise<DialogResult<string>> {
  return new Promise((resolve) => {
    const dialogPath = getDialogPath(pluginDir)
    const child = spawn(dialogPath, args, { stdio: ["inherit", "pipe", "pipe"] })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (data) => { stdout += data.toString() })
    child.stderr?.on("data", (data) => { stderr += data.toString() })

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, value: stdout.trim() })
      } else {
        resolve({ ok: false, error: stderr.trim() || `Exit code: ${code}` })
      }
    })

    child.on("error", (err) => {
      resolve({ ok: false, error: err.message })
    })
  })
}

export async function showYesNo(
  pluginDir: string,
  options: { message: string; title?: string }
): Promise<DialogResult<boolean>> {
  const args = ["yesno", "--message", options.message]
  if (options.title) args.push("--title", options.title)

  const result = await runDialog(pluginDir, args)
  if (!result.ok) return result

  return { ok: true, value: result.value.toLowerCase() === "true" }
}

export async function showSelect(
  pluginDir: string,
  options: { items: string[]; title?: string }
): Promise<DialogResult<string>> {
  const args = ["select", "--items", options.items.join(",")]
  if (options.title) args.push("--title", options.title)

  return runDialog(pluginDir, args)
}

export async function showMarkdown(
  pluginDir: string,
  options: { content: string; title?: string }
): Promise<DialogResult<string>> {
  const args = ["md", "--content", options.content]
  if (options.title) args.push("--title", options.title)

  return runDialog(pluginDir, args)
}

export async function showGitBranchPicker(
  pluginDir: string,
  options?: { title?: string }
): Promise<DialogResult<string>> {
  const args = ["git"]
  if (options?.title) args.push("--title", options.title)

  return runDialog(pluginDir, args)
}
