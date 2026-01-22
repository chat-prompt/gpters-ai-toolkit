import { spawn } from "node:child_process"
import type { GitCommandResult } from "./types"

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["status", "--porcelain"], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""

    child.stdout.on("data", (data) => {
      output += data
    })

    child.on("close", () => {
      resolve(output.trim().length > 0)
    })

    child.on("error", () => {
      resolve(false)
    })
  })
}

export async function stashChanges(cwd: string, message: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["stash", "push", "-m", message, "--include-untracked"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""

    child.stderr.on("data", (data) => {
      stderr += data
    })

    child.on("close", (code) => {
      resolve(code === 0 ? { success: true } : { success: false, error: stderr.trim() })
    })

    child.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

export async function popStash(cwd: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["stash", "pop"], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""

    child.stderr.on("data", (data) => {
      stderr += data
    })

    child.on("close", (code) => {
      resolve(code === 0 ? { success: true } : { success: false, error: stderr.trim() })
    })

    child.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}
