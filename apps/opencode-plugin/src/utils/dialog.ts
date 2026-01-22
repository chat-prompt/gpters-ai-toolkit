import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export type DialogResult<T> = { ok: true; value: T } | { ok: false; error: string }

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getDialogPath(): string {
  return join(__dirname, "bin", "dialog")
}

function runDialog(args: string[]): Promise<DialogResult<string>> {
  return new Promise((resolve) => {
    const dialogPath = getDialogPath()
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
  options: { message: string; title?: string; yesText?: string; noText?: string }
): Promise<DialogResult<boolean>> {
  const args = ["yesno", "--message", options.message]
  if (options.title) args.push("--title", options.title)
  if (options.yesText) args.push("--yes-text", options.yesText)
  if (options.noText) args.push("--no-text", options.noText)

  const result = await runDialog(args)
  if (!result.ok) return result

  return { ok: true, value: result.value.toLowerCase() === "true" }
}

export async function showSelect(
  options: { items: string[]; title?: string }
): Promise<DialogResult<string>> {
  const args = ["select", "--items", options.items.join(",")]
  if (options.title) args.push("--title", options.title)

  return runDialog(args)
}

export async function showMarkdown(
  options: { content: string; title?: string }
): Promise<DialogResult<string>> {
  const args = ["md", "--content", options.content]
  if (options.title) args.push("--title", options.title)

  return runDialog(args)
}

export async function showGitBranchPicker(
  options?: { title?: string }
): Promise<DialogResult<string>> {
  const args = ["git"]
  if (options?.title) args.push("--title", options.title)

  return runDialog(args)
}
