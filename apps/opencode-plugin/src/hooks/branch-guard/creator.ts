import { spawn } from "node:child_process"
import type { GitCommandResult } from "./types"

export async function createBranch(cwd: string, branchName: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["checkout", "-b", branchName], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    let stdout = ""

    child.stdout.on("data", (data) => {
      stdout += data
    })

    child.stderr.on("data", (data) => {
      stderr += data
    })

    child.on("close", (code) => {
      resolve(code === 0 ? { success: true, output: stdout.trim() } : { success: false, error: stderr.trim() })
    })

    child.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

export async function checkoutBranch(cwd: string, branchName: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["checkout", branchName], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    let stdout = ""

    child.stdout.on("data", (data) => {
      stdout += data
    })

    child.stderr.on("data", (data) => {
      stderr += data
    })

    child.on("close", (code) => {
      resolve(code === 0 ? { success: true, output: stdout.trim() } : { success: false, error: stderr.trim() })
    })

    child.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}
